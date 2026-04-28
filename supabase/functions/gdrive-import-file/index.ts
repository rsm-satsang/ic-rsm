import { corsHeaders } from "@supabase/supabase-js/cors";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_DRIVE_API_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!GOOGLE_DRIVE_API_KEY) throw new Error("GOOGLE_DRIVE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { project_id, file_id, file_name, mime_type, size_bytes } = body ?? {};
    if (!project_id || !file_id || !file_name) {
      return new Response(JSON.stringify({ error: "project_id, file_id, file_name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download file content from Google Drive via gateway
    const driveResp = await fetch(`${GATEWAY_URL}/files/${file_id}?alt=media`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
      },
    });

    if (!driveResp.ok) {
      const errText = await driveResp.text();
      throw new Error(`Drive download failed [${driveResp.status}]: ${errText}`);
    }

    const fileBuffer = await driveResp.arrayBuffer();

    // Upload to Supabase storage
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const ext = (file_name.split(".").pop() || "mp4").toLowerCase();
    const storagePath = `${project_id}/${Date.now()}-gdrive-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadErr } = await admin.storage
      .from("project-references")
      .upload(storagePath, new Uint8Array(fileBuffer), {
        contentType: mime_type || "video/mp4",
        upsert: false,
      });
    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    // Insert reference_files row
    const { data: refRow, error: insertErr } = await admin
      .from("reference_files")
      .insert({
        project_id,
        uploaded_by: userId,
        storage_path: storagePath,
        file_name,
        file_type: "video",
        size_bytes: size_bytes ?? fileBuffer.byteLength,
        status: "uploaded",
        metadata: { source: "google_drive", drive_file_id: file_id },
      })
      .select()
      .single();
    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

    // Queue extraction
    await admin.from("extraction_jobs").insert({
      reference_file_id: refRow.id,
      project_id,
      requested_by: userId,
      job_type: "video_parse",
      status: "queued",
    });

    return new Response(JSON.stringify({ success: true, reference_file: refRow }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("gdrive-import-file error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
