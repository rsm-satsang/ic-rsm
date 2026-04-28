import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Gemini Files API base
const GEMINI_UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GEMINI_FILES_BASE = "https://generativelanguage.googleapis.com/v1beta/files";
const GEMINI_MODEL = "gemini-2.5-flash";

const PROMPT = `You are an expert short-form video editor. Watch this video and identify up to 4 short clips (each 5-15 seconds) that would make the most compelling YouTube Short.

Pick moments that:
- Evoke curiosity, surprise, emotion, or a "wow" reaction
- Tease the most interesting insight, story beat, or visual of the video
- Would make a viewer want to watch the full video

Return ONLY a valid JSON object (no markdown, no prose) in this exact shape:
{
  "clips": [
    {
      "start_seconds": 12.5,
      "end_seconds": 22.0,
      "title": "Short punchy title",
      "reason": "Why this clip hooks viewers (1 sentence)"
    }
  ]
}

Rules:
- start_seconds and end_seconds are numbers in seconds (decimals allowed)
- Maximum 4 clips. Fewer is fine if the video is short or has limited highlights.
- Each clip MUST be between 3 and 20 seconds long.
- Order clips from most to least compelling.`;

async function pollFileUntilActive(fileName: string, apiKey: string, maxWaitMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
    if (!r.ok) throw new Error(`File status check failed: ${r.status}`);
    const data = await r.json();
    if (data.state === "ACTIVE") return data;
    if (data.state === "FAILED") throw new Error(`Gemini file processing FAILED: ${JSON.stringify(data)}`);
    await new Promise((res) => setTimeout(res, 2500));
  }
  throw new Error("Timed out waiting for Gemini to process the video.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) throw new Error("Supabase env not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { reference_file_id } = await req.json().catch(() => ({}));
    if (!reference_file_id) {
      return new Response(JSON.stringify({ error: "reference_file_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: refRow, error: refErr } = await admin
      .from("reference_files").select("*").eq("id", reference_file_id).single();
    if (refErr || !refRow) throw new Error("Reference file not found");
    if (!refRow.storage_path) throw new Error("Reference file has no storage_path");

    // Download video bytes from Supabase storage
    const { data: blob, error: dlErr } = await admin.storage
      .from("project-references").download(refRow.storage_path);
    if (dlErr || !blob) throw new Error(`Storage download failed: ${dlErr?.message}`);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const mimeType = (refRow.metadata as any)?.mime_type || blob.type || "video/mp4";
    const displayName = refRow.file_name || "video.mp4";

    console.log(`Uploading ${displayName} (${buf.byteLength} bytes, ${mimeType}) to Gemini Files API...`);

    // Step 1: Start resumable upload
    const startResp = await fetch(`${GEMINI_UPLOAD_BASE}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(buf.byteLength),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    });
    if (!startResp.ok) {
      throw new Error(`Gemini upload start failed [${startResp.status}]: ${await startResp.text()}`);
    }
    const uploadUrl = startResp.headers.get("X-Goog-Upload-URL");
    if (!uploadUrl) throw new Error("Gemini did not return upload URL");

    // Step 2: Upload bytes
    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(buf.byteLength),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: buf,
    });
    if (!uploadResp.ok) {
      throw new Error(`Gemini upload failed [${uploadResp.status}]: ${await uploadResp.text()}`);
    }
    const uploadData = await uploadResp.json();
    const fileName = uploadData?.file?.name; // e.g. "files/abc123"
    const fileUri = uploadData?.file?.uri;
    if (!fileName || !fileUri) throw new Error(`Unexpected upload response: ${JSON.stringify(uploadData)}`);

    console.log(`Uploaded as ${fileName}. Waiting for ACTIVE state...`);
    await pollFileUntilActive(fileName, GEMINI_API_KEY);

    // Step 3: Generate content
    const genResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { fileData: { mimeType, fileUri } },
              { text: PROMPT },
            ],
          }],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
            maxOutputTokens: 2048,
          },
        }),
      },
    );
    if (!genResp.ok) {
      throw new Error(`Gemini generateContent failed [${genResp.status}]: ${await genResp.text()}`);
    }
    const genData = await genResp.json();
    const text = genData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) throw new Error(`Gemini returned no content: ${JSON.stringify(genData)}`);

    let parsed: any;
    try { parsed = JSON.parse(text); }
    catch { throw new Error(`Gemini returned invalid JSON: ${text}`); }

    let clips = Array.isArray(parsed?.clips) ? parsed.clips : [];
    clips = clips
      .filter((c: any) => typeof c?.start_seconds === "number" && typeof c?.end_seconds === "number" && c.end_seconds > c.start_seconds)
      .slice(0, 4)
      .map((c: any, i: number) => ({
        id: `clip_${i}_${Math.random().toString(36).slice(2, 8)}`,
        start_seconds: Number(c.start_seconds),
        end_seconds: Number(c.end_seconds),
        title: String(c.title || `Clip ${i + 1}`),
        reason: String(c.reason || ""),
      }));

    // Try to clean up Gemini file (best-effort)
    fetch(`${GEMINI_FILES_BASE}/${fileName.replace("files/", "")}?key=${GEMINI_API_KEY}`, { method: "DELETE" })
      .catch(() => {});

    return new Response(JSON.stringify({ success: true, clips }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("identify-video-clips error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
