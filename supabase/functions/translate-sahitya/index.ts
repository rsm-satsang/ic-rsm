import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) throw new Error("Invalid user");

    const { projectId } = await req.json();
    if (!projectId) throw new Error("projectId required");

    // Fetch reference files
    const { data: files, error: fErr } = await supabase
      .from("reference_files")
      .select("*")
      .eq("project_id", projectId);
    if (fErr) throw fErr;

    // Build content blocks for OpenAI vision
    const contentBlocks: any[] = [
      {
        type: "text",
        text: `You are an expert Hindi-to-English translator and spiritual literature curator (Sahitya).

You will receive references (images of Hindi text and/or extracted Hindi text). Perform ALL of the following:

1. **Extract Hindi Text**: For every image, accurately extract the full Hindi (Devanagari) text shown. Preserve paragraph breaks.
2. **Paragraph-by-Paragraph English Translation**: For each Hindi paragraph, output:
   - The original Hindi paragraph
   - Immediately followed by a faithful English translation
   - Separated clearly with markdown
3. **Substack Newsletter Topics**: At the very end, under a heading "## 🌿 Suggested Substack Newsletter Topics", list 5–8 newsletter topic ideas that could be developed from these Sahitya references. Each topic should have a short title and a 1-2 line description.

OUTPUT FORMAT (Markdown only):

# 📜 Sahitya Translation

## Source 1: <file name>

### Hindi (Original)
<paragraph 1 in Devanagari>

### English Translation
<paragraph 1 in English>

---

### Hindi (Original)
<paragraph 2>

### English Translation
<paragraph 2>

(repeat for all paragraphs and all sources)

## 🌿 Suggested Substack Newsletter Topics

1. **<Topic Title>** — <1-2 line description>
2. ...

Be precise, devotional in tone, and never fabricate content beyond what the references contain.`,
      },
    ];

    let hasContent = false;

    for (const file of files || []) {
      contentBlocks.push({ type: "text", text: `\n\n=== SOURCE: ${file.file_name || "Unnamed"} ===` });

      if (file.file_type === "image" && file.storage_path) {
        const { data: signed } = await supabase.storage
          .from("project-references")
          .createSignedUrl(file.storage_path, 3600);
        if (signed?.signedUrl) {
          contentBlocks.push({ type: "image_url", image_url: { url: signed.signedUrl } });
          hasContent = true;
        }
      } else if (file.extracted_text) {
        contentBlocks.push({ type: "text", text: file.extracted_text });
        hasContent = true;
      }
    }

    if (!hasContent) throw new Error("No usable references found. Please add Hindi images or text references.");

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: contentBlocks }],
        max_tokens: 8000,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI error:", openaiRes.status, errText);
      throw new Error(`OpenAI failed (${openaiRes.status}): ${errText.slice(0, 300)}`);
    }

    const data = await openaiRes.json();
    const text = data?.choices?.[0]?.message?.content || "";
    if (!text) throw new Error("Empty response from OpenAI");

    // Save as a version
    const { data: maxV } = await supabase
      .from("versions")
      .select("version_number")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNumber = (maxV?.version_number || 0) + 1;

    // Convert to simple HTML preserving paragraphs
    const html = text
      .split(/\n\n+/)
      .map((p: string) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
      .join("");

    const { error: vErr } = await supabase.from("versions").insert({
      project_id: projectId,
      version_number: nextNumber,
      title: `Sahitya Translation v${nextNumber}`,
      description: "Hindi extraction, English translation, and newsletter topics",
      content: html,
      created_by: user.id,
    });
    if (vErr) throw vErr;

    return new Response(JSON.stringify({ text, versionNumber: nextNumber }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate-sahitya error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
