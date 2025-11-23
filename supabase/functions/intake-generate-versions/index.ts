import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { project_id, goal, llm_chat, reference_file_ids } = await req.json();

    // Verify access
    const { data: hasAccess } = await supabase.rpc('has_project_access', {
      _project_id: project_id,
      _user_id: user.id,
    });

    if (!hasAccess) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get reference files
    let query = supabase
      .from('reference_files')
      .select('*')
      .eq('project_id', project_id)
      .eq('status', 'done');

    if (reference_file_ids && reference_file_ids.length > 0) {
      query = query.in('id', reference_file_ids);
    }

    const { data: referenceFiles, error: filesError } = await query;

    if (filesError) throw filesError;

    if (!referenceFiles || referenceFiles.length === 0) {
      return new Response(JSON.stringify({ error: 'No reference files found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Aggregate extracted text for v1
    const aggregatedText = referenceFiles
      .map((file) => {
        const header = `\n\n=== ${file.file_name} ===\n`;
        const content = file.extracted_text || '';
        return header + content;
      })
      .join('\n');

    // Get next version number
    const { data: versions } = await supabase
      .from('versions')
      .select('version_number')
      .eq('project_id', project_id)
      .order('version_number', { ascending: false })
      .limit(1);

    const nextVersionNumber = (versions?.[0]?.version_number || 0) + 1;

    // Create v1 - Raw Extracted Text
    const { data: v1, error: v1Error } = await supabase
      .from('versions')
      .insert({
        project_id,
        version_number: nextVersionNumber,
        title: 'v1 - Raw Extracted Text',
        description: `Aggregated text from ${referenceFiles.length} reference files`,
        content: aggregatedText,
        created_by: user.id,
      })
      .select()
      .single();

    if (v1Error) throw v1Error;

    // Create v2 - Draft 1 using Gemini
    const goalDescriptions: { [key: string]: string } = {
      substack_article: 'a Substack article with engaging headlines, clear sections, and conversational tone',
      email: 'a professional email with clear subject line, greeting, body paragraphs, and call-to-action',
      report: 'a formal report with executive summary, findings, analysis, and recommendations',
      research_summary: 'a research summary with key findings, methodology overview, and implications',
    };

    const goalDesc = goalDescriptions[goal] || goal;

    const systemPrompt = `You are an expert content writer and editor. Your task is to transform the provided reference materials into ${goalDesc}.

CRITICAL INSTRUCTIONS:
1. READ AND USE ALL the reference text provided below - do not skip or summarize the source material
2. Transform the raw extracted content into well-structured, polished ${goalDesc}
3. Preserve all key information, facts, data, and insights from the references
4. Organize the content logically with appropriate headings and structure
5. Use ONLY information present in the references - do not add external information
6. If references contain tables or structured data, present them clearly
7. Maintain professional tone and clarity throughout

${llm_chat ? `\nADDITIONAL USER REQUIREMENTS:\n${llm_chat}\n` : ''}

REFERENCE MATERIALS (USE ALL OF THIS CONTENT):
${aggregatedText}

Now, create ${goalDesc} using ALL the information provided above:`;

    let v2Content = '';

    if (GEMINI_API_KEY) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: systemPrompt }]
              }]
            }),
          }
        );

        const data = await response.json();
        v2Content = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Error generating draft';
      } catch (error: any) {
        console.error('Gemini API error:', error);
        v2Content = `[Draft generation failed: ${error.message}]\n\n${aggregatedText}`;
      }
    } else {
      v2Content = `[Gemini API key not configured]\n\n${aggregatedText}`;
    }

    // Create v2 - Draft 1
    const { data: v2, error: v2Error } = await supabase
      .from('versions')
      .insert({
        project_id,
        version_number: nextVersionNumber + 1,
        title: 'v2 - Draft 1',
        description: `AI-generated ${goalDesc}`,
        content: v2Content,
        created_by: user.id,
      })
      .select()
      .single();

    if (v2Error) throw v2Error;

    // Get user data for timeline
    const { data: userData } = await supabase
      .from('users')
      .select('name')
      .eq('id', user.id)
      .single();

    // Create timeline events
    await supabase.from('timeline').insert([
      {
        project_id,
        event_type: 'version_created',
        event_details: {
          version: nextVersionNumber,
          title: 'v1 - Raw Extracted Text',
          auto_generated: true,
        },
        user_id: user.id,
        user_name: userData?.name || 'Unknown User',
      },
      {
        project_id,
        event_type: 'version_created',
        event_details: {
          version: nextVersionNumber + 1,
          title: 'v2 - Draft 1',
          auto_generated: true,
          goal,
        },
        user_id: user.id,
        user_name: userData?.name || 'Unknown User',
      },
    ]);

    return new Response(
      JSON.stringify({
        v1_version_id: v1.id,
        v2_version_id: v2.id,
        status: 'completed',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in intake-generate-versions:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
