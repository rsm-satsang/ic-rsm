const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_DRIVE_API_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!GOOGLE_DRIVE_API_KEY) throw new Error("GOOGLE_DRIVE_API_KEY not configured");

    const url = new URL(req.url);
    const pageToken = url.searchParams.get("pageToken") || "";
    const search = url.searchParams.get("q") || "";

    const qParts = ["mimeType contains 'video/'", "trashed = false"];
    if (search.trim()) qParts.push(`name contains '${search.replace(/'/g, "\\'")}'`);
    const q = qParts.join(" and ");

    const params = new URLSearchParams({
      q,
      pageSize: "50",
      fields: "nextPageToken, files(id, name, mimeType, size, thumbnailLink, modifiedTime, iconLink)",
      orderBy: "modifiedTime desc",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const resp = await fetch(`${GATEWAY_URL}/files?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
      },
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(`Drive list failed [${resp.status}]: ${JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("gdrive-list-videos error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
