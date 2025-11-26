import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-project-id',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // Get organization-wide Gemini API key from secrets
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'Gemini API key not configured. Please contact your administrator.' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { prompt, action, projectId } = await req.json();

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    console.log('Calling Gemini API with action:', action);

    // Call Gemini API - using gemini-2.5-flash (latest stable model)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_NONE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_NONE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_NONE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_NONE"
            }
          ]
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API error:', errorData);
      throw new Error(`Gemini API error: ${response.status} ${errorData}`);
    }

    const data = await response.json();
    console.log('Gemini API response received:', JSON.stringify(data));

    // Check if response has candidates or handle safety blocks
    if (!data.candidates || data.candidates.length === 0) {
      console.error('No candidates in Gemini response:', JSON.stringify(data));

      // If Gemini blocked the content, return a detailed but safe error payload
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) {
        console.error('Gemini blocked the request with reason:', blockReason);

        const promptPreview =
          typeof prompt === 'string'
            ? prompt.slice(0, 2000)
            : '';

        return new Response(
          JSON.stringify({
            error: `Gemini blocked this request (${blockReason}). This came directly from the model's safety system.`,
            success: false,
            blockReason,
            gemini: {
              promptFeedback: data.promptFeedback ?? null,
              usageMetadata: data.usageMetadata ?? null,
              modelVersion: data.modelVersion ?? null,
            },
            promptPreview,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      throw new Error('Gemini API returned no content. This may be due to safety filters or an invalid API key.');
    }

    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!generatedText) {
      console.error('Empty text in Gemini response:', JSON.stringify(data));
      throw new Error('Gemini API returned empty content.');
    }

    // Log AI usage
    const { error: logError } = await supabase.from('ai_logs').insert({
      project_id: projectId || null,
      action_type: action || 'generate',
      compiled_prompt: prompt,
      response: generatedText,
      created_by: user.id,
    });

    if (logError) {
      console.error('Failed to log AI usage:', logError);
    }

    return new Response(
      JSON.stringify({ 
        text: generatedText,
        success: true 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in gemini-ai function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
