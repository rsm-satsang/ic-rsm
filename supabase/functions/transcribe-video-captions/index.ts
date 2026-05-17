import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GEMINI_FILES_BASE = "https://generativelanguage.googleapis.com/v1beta/files";
const GEMINI_MODEL = "gemini-2.5-flash";

const PROMPT = `Transcribe the spoken audio in this video into short caption segments suitable for burned-in subtitles on a YouTube Short, identify every conversational filler sound with precise timestamps so they can be muted from the audio, AND propose a punchy short title (max 8 words, Title Case, no quotes, no trailing punctuation) summarizing the core message of the clip — suitable as a YouTube Shorts title.

Return ONLY valid JSON in this exact shape:
{
  "suggested_title": "Find Inner Peace Through Satsang",
  "segments": [
    { "start_seconds": 0.0, "end_seconds": 2.4, "text": "Short caption line" }
  ],
  "filler_ranges": [
    { "start_seconds": 1.23, "end_seconds": 1.55 }
  ]
}

Rules for "segments":
- Each segment should be 1-4 seconds long and contain at most ~7 words.
- Cover the full duration of the video; segments must be in order and not overlap.
- Use the original spoken language. Do not translate.
- IMPORTANT: Remove all conversational filler sounds and disfluencies such as "uh", "uhh", "um", "umm", "ah", "ahh", "er", "erm", "hmm", "huh", "mm", "mmm", "uh-huh", "uh-uhh", "you know", "like" (when used as filler), and any repeated stuttered words. Output only clean, readable speech.
- If a segment would be empty after removing fillers, skip it entirely.
- If no speech is present, return { "segments": [] }.

Rules for "filler_ranges":
- List EVERY occurrence of the above filler sounds/disfluencies in the audio with tight start and end timestamps in seconds (precision ~0.05s).
- Include only the filler sound itself (and a tiny padding of ~50ms if needed), NOT surrounding clean speech.
- If none, return "filler_ranges": [].`;

async function pollFileUntilActive(fileName: string, apiKey: string, maxWaitMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
    if (!r.ok) throw new Error(`File status check failed: ${r.status}`);
    const data = await r.json();
    if (data.state === "ACTIVE") return data;
    if (data.state === "FAILED") throw new Error(`Gemini file processing FAILED`);
    await new Promise((res) => setTimeout(res, 2500));
  }
  throw new Error("Timed out waiting for Gemini to process the video.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      throw new Error("Server env not configured");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { reference_file_id } = await req.json().catch(() => ({}));
    if (!reference_file_id) {
      return new Response(JSON.stringify({ error: "reference_file_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: refRow, error: refErr } = await admin.from("reference_files").select("*").eq("id", reference_file_id).single();
    if (refErr || !refRow?.storage_path) throw new Error("Reference file not found or missing storage_path");

    const { data: blob, error: dlErr } = await admin.storage.from("project-references").download(refRow.storage_path);
    if (dlErr || !blob) throw new Error(`Storage download failed: ${dlErr?.message}`);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const mimeType = (refRow.metadata as any)?.mime_type || blob.type || "video/mp4";
    const displayName = refRow.file_name || "video.mp4";

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
    if (!startResp.ok) throw new Error(`Gemini upload start failed [${startResp.status}]: ${await startResp.text()}`);
    const uploadUrl = startResp.headers.get("X-Goog-Upload-URL");
    if (!uploadUrl) throw new Error("Gemini did not return upload URL");

    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Length": String(buf.byteLength), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
      body: buf,
    });
    if (!uploadResp.ok) throw new Error(`Gemini upload failed [${uploadResp.status}]: ${await uploadResp.text()}`);
    const uploadData = await uploadResp.json();
    const fileName = uploadData?.file?.name;
    const fileUri = uploadData?.file?.uri;
    if (!fileName || !fileUri) throw new Error("Unexpected upload response");

    await pollFileUntilActive(fileName, GEMINI_API_KEY);

    const genResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ fileData: { mimeType, fileUri } }, { text: PROMPT }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            maxOutputTokens: 32768,
            responseSchema: {
              type: "OBJECT",
              properties: {
                suggested_title: { type: "STRING" },
              segments: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      start_seconds: { type: "NUMBER" },
                      end_seconds: { type: "NUMBER" },
                      text: { type: "STRING" },
                    },
                    required: ["start_seconds", "end_seconds", "text"],
                  },
                },
                filler_ranges: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      start_seconds: { type: "NUMBER" },
                      end_seconds: { type: "NUMBER" },
                    },
                    required: ["start_seconds", "end_seconds"],
                  },
                },
              },
              required: ["segments"],
            },
          },
        }),
      },
    );
    if (!genResp.ok) throw new Error(`Gemini generateContent failed [${genResp.status}]: ${await genResp.text()}`);
    const genData = await genResp.json();
    const text = genData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) throw new Error("Gemini returned no content");

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Salvage from possibly-truncated JSON: extract valid segment objects via regex
      const segRe = /\{\s*"start_seconds"\s*:\s*([\d.]+)\s*,\s*"end_seconds"\s*:\s*([\d.]+)\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
      const segs: any[] = [];
      let m: RegExpExecArray | null;
      while ((m = segRe.exec(text)) !== null) {
        segs.push({ start_seconds: Number(m[1]), end_seconds: Number(m[2]), text: m[3] });
      }
      const fillRe = /\{\s*"start_seconds"\s*:\s*([\d.]+)\s*,\s*"end_seconds"\s*:\s*([\d.]+)\s*\}/g;
      const fills: any[] = [];
      while ((m = fillRe.exec(text)) !== null) {
        fills.push({ start_seconds: Number(m[1]), end_seconds: Number(m[2]) });
      }
      const titleMatch = text.match(/"suggested_title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (segs.length === 0) throw new Error(`Invalid JSON: ${text.slice(0, 500)}`);
      parsed = { segments: segs, filler_ranges: fills, suggested_title: titleMatch?.[1] || "" };
    }

    const segments = (Array.isArray(parsed?.segments) ? parsed.segments : [])
      .filter((s: any) => typeof s?.start_seconds === "number" && typeof s?.end_seconds === "number" && s.end_seconds > s.start_seconds && typeof s.text === "string")
      .map((s: any) => ({ start_seconds: Number(s.start_seconds), end_seconds: Number(s.end_seconds), text: String(s.text).trim() }));

    const filler_ranges = (Array.isArray(parsed?.filler_ranges) ? parsed.filler_ranges : [])
      .filter((r: any) => typeof r?.start_seconds === "number" && typeof r?.end_seconds === "number" && r.end_seconds > r.start_seconds)
      .map((r: any) => ({ start_seconds: Number(r.start_seconds), end_seconds: Number(r.end_seconds) }))
      .sort((a: any, b: any) => a.start_seconds - b.start_seconds);

    const suggested_title = typeof parsed?.suggested_title === "string" ? parsed.suggested_title.trim() : "";

    fetch(`${GEMINI_FILES_BASE}/${fileName.replace("files/", "")}?key=${GEMINI_API_KEY}`, { method: "DELETE" }).catch(() => {});

    return new Response(JSON.stringify({ success: true, segments, filler_ranges, suggested_title }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("transcribe-video-captions error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
