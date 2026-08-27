import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { project_id, goal, llm_chat, vocabulary, reference_file_ids } = await req.json();

    // Verify access
    const { data: hasAccess } = await supabase.rpc("has_project_access", {
      _project_id: project_id,
      _user_id: user.id,
    });

    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get reference files
    let query = supabase.from("reference_files").select("*").eq("project_id", project_id).eq("status", "done");

    if (reference_file_ids && reference_file_ids.length > 0) {
      query = query.in("id", reference_file_ids);
    }

    const { data: referenceFiles, error: filesError } = await query;

    if (filesError) throw filesError;

    if (!referenceFiles || referenceFiles.length === 0) {
      return new Response(JSON.stringify({ error: "No reference files found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aggregate extracted text for v1 with proper formatting
    const aggregatedText = referenceFiles
      .map((file, index) => {
        const separator = index === 0 ? "" : "\n\n";
        const header = `${separator}=== BEGIN SOURCE: ${file.file_name} ===\n\n`;
        const content = file.extracted_text || "";
        const footer = `\n\n=== END SOURCE: ${file.file_name} ===`;
        return header + content + footer;
      })
      .join("");

    // Get next version number
    const { data: versions } = await supabase
      .from("versions")
      .select("version_number")
      .eq("project_id", project_id)
      .order("version_number", { ascending: false })
      .limit(1);

    const nextVersionNumber = (versions?.[0]?.version_number || 0) + 1;

    // Create v1 - Raw Extracted Text
    const { data: v1, error: v1Error } = await supabase
      .from("versions")
      .insert({
        project_id,
        version_number: nextVersionNumber,
        title: "v1 - Raw Extracted Text",
        description: `Aggregated text from ${referenceFiles.length} reference files`,
        content: aggregatedText,
        created_by: user.id,
      })
      .select()
      .single();

    if (v1Error) throw v1Error;

    // Create v2 - Draft 1 using Gemini
    const goalDescriptions: { [key: string]: string } = {
      substack_article: "a Substack article with engaging headlines, clear sections, and conversational tone",
      email: "a professional email with clear subject line, greeting, body paragraphs, and call-to-action",
      report: "a formal report with executive summary, findings, analysis, and recommendations",
      research_summary: "a research summary with key findings, methodology overview, and implications",
    };

    const goalDesc = goalDescriptions[goal] || goal;

    // Build vocabulary instructions
    let vocabularyInstructions = "";
    if (vocabulary && Array.isArray(vocabulary) && vocabulary.length > 0) {
      vocabularyInstructions = `\n\nVOCABULARY TERMS TO ENFORCE:
Follow these terminology preferences strictly:
${vocabulary.map((term) => `- ${term}`).join("\n")}
Replace any alternative terms with these preferred terms throughout the content.\n`;
    }

    const systemPrompt = `You are an expert **spiritual editorial writer and newsletter editor**. Your task is to transform the provided reference materials into **${goalDesc}** in the signature style of a **Satsang spiritual newsletter**.

Your writing must feel like it comes from a **compassionate spiritual guide speaking to a sincere community of seekers** — calm, reflective, experiential, and grace-centered.

You are not summarizing.
You are **recreating the lived experience of reading a spiritually grounded, devotional newsletter**.

---

## 🌿 TONE & VOICE (MANDATORY)

Write with a voice that is:

• Warm, gentle, and emotionally reassuring
• Reflective and spiritually grounded
• Personal but not casual
• Deep yet simple
• Devotional without being preachy
• Wise without sounding academic

The reader should feel:
Supported. Included. Understood. Guided.

Never sound like marketing, blogging, motivational speaking, or academic writing.

---

## 🧘 CONTENT FLOW STRUCTURE

Unless the source material clearly demands a different structure, follow this teaching rhythm:

1️⃣ Gentle Hook or Opening Spiritual Insight
2️⃣ Introduction of the Core Idea or Question
3️⃣ Story, Example, Analogy, or Lived Experience
4️⃣ Deeper Teaching Section (clear spiritual explanation)
5️⃣ Practical Integration into Daily Life or Inner Growth
6️⃣ Soft Reflective Closing that leaves the reader peaceful and uplifted

Teach progressively. Keep language simple but meaningful.

---

## CRITICAL OUTPUT FORMAT — RICH, ENGAGING MARKDOWN (SUBSTACK STYLE)

You must generate content that looks polished, calm, engaging, and publication-ready like a professional Substack-style spiritual newsletter.

---

## VISUAL STYLE & EMOJIS

1. Use relevant, soft emojis throughout to make content visually expressive and gentle
2. Start major sections with calm-toned emojis (🌿 🌸 🌞 🕊️ ✨ 💫)
3. Use emojis to lightly highlight important insights or transitions — never excessively
4. Add visual separators between major sections using:
   ─────────────────
   ✦ ✦ ✦
   • • •
5. Use pull quotes or highlighted text boxes for spiritual insights:

   > 💬 "Short reflective or devotional quote"

---

## HEADING STRUCTURE

1. Use **##** for main section headings and **###** for subsections
2. Keep headings reflective and meaningful, not clickbait
3. Add relevant emojis where appropriate
4. Maintain consistent heading hierarchy
5. Add ONE blank line before and after each heading

---

## PARAGRAPH FORMATTING

1. Separate every paragraph with ONE blank line
2. Keep paragraphs short and flowing (2–4 sentences max)
3. Use occasional single-line paragraphs for emotional emphasis
4. Begin with a calm but engaging opening line

---

## TEXT EMPHASIS

1. Use **bold text** to highlight key spiritual principles and insights
2. Use *italics* for reflective phrases or gentle emphasis
3. Use bullet lists (with soft emojis) only when clarity is needed
4. Use numbered lists only for step-by-step spiritual processes

---

## ENGAGEMENT ELEMENTS (GENTLE, NOT MARKETING)

1. Use reflective questions occasionally
2. Include insight callouts using blockquotes

   > 🌸 Reflection
   > 💡 Gentle Insight
3. Add a short reflective takeaway section when appropriate
4. End sections with smooth, contemplative transitions

---

## CRITICAL RULES

1. Output ONLY clean Markdown — NO HTML
2. NO code blocks
3. NO commentary or meta explanations
4. Do not mention prompts, references, or instructions
5. Do not fabricate teachings, quotes, or lineage details not present in the reference
6. The final piece must feel calm, spacious, devotional, and sincere

---

## CONTENT INSTRUCTIONS

1. READ AND USE ALL the reference text provided below
2. Transform the raw material into well-structured, polished **${goalDesc}**
3. Preserve all key teachings, explanations, and insights
4. Do not add outside research or modern psychology unless explicitly present
5. Clarify — do not expand beyond the source meaning
6. Maintain spiritual authenticity and emotional sensitivity
   ${vocabularyInstructions}

${llm_chat ? `\nADDITIONAL USER REQUIREMENTS:\n${llm_chat}\n` : ""}

---

## REFERENCE MATERIALS

${aggregatedText}

---

Now, create **${goalDesc}** in a **calm, devotional, Satsang-style newsletter format**, written as a **visually gentle, reflective, Substack-style Markdown article**.`;

    let v2Content = "";

    if (GEMINI_API_KEY) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: systemPrompt }],
                },
              ],
            }),
          },
        );

        const data = await response.json();

        if (!response.ok || data.error) {
          console.error("Gemini draft generation error:", {
            status: response.status,
            statusText: response.statusText,
            error: data.error,
          });
          throw new Error(data.error?.message || `Gemini draft generation failed with HTTP ${response.status}`);
        }

        v2Content = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!v2Content || !v2Content.trim()) {
          console.error("Gemini draft generation returned empty content", data);
          v2Content = `[Draft generation failed: empty response from Gemini]\n\n${aggregatedText}`;
        }
      } catch (error: any) {
        console.error("Gemini API error in intake-generate-versions:", error);
        v2Content = `[Draft generation failed: ${error.message ?? "Unknown error"}]\n\n${aggregatedText}`;
      }
    } else {
      v2Content = `[Gemini API key not configured]\n\n${aggregatedText}`;
    }

    // Prefix the draft with the project title as an H1 heading
    const { data: projectRow } = await supabase
      .from("projects")
      .select("title")
      .eq("id", project_id)
      .maybeSingle();
    const projectTitle = (projectRow?.title || "").trim();
    if (projectTitle && !/^\s*#\s/.test(v2Content)) {
      v2Content = `# ${projectTitle}\n\n${v2Content}`;
    }

    // Create v2 - Draft 1
    const { data: v2, error: v2Error } = await supabase
      .from("versions")
      .insert({
        project_id,
        version_number: nextVersionNumber + 1,
        title: "v2 - Draft 1",
        description: `AI-generated ${goalDesc}`,
        content: v2Content,
        created_by: user.id,
      })
      .select()
      .single();

    if (v2Error) throw v2Error;

    // Get user data for timeline
    const { data: userData } = await supabase.from("users").select("name").eq("id", user.id).single();

    // Create timeline events
    await supabase.from("timeline").insert([
      {
        project_id,
        event_type: "version_created",
        event_details: {
          version: nextVersionNumber,
          title: "v1 - Raw Extracted Text",
          auto_generated: true,
        },
        user_id: user.id,
        user_name: userData?.name || "Unknown User",
      },
      {
        project_id,
        event_type: "version_created",
        event_details: {
          version: nextVersionNumber + 1,
          title: "v2 - Draft 1",
          auto_generated: true,
          goal,
        },
        user_id: user.id,
        user_name: userData?.name || "Unknown User",
      },
    ]);

    return new Response(
      JSON.stringify({
        v1_version_id: v1.id,
        v2_version_id: v2.id,
        status: "completed",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in intake-generate-versions:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
