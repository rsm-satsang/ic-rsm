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

    // Get organization-wide API keys from secrets
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    const { prompt, action, projectId, model = 'gemini' } = await req.json();

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    console.log('Calling AI with action:', action, 'model:', model);

    let generatedText = '';

    // Route to appropriate model
    // Check if it's an OpenAI model
    const openaiModels = ['gpt-5', 'gpt-5.2', 'gpt-5-mini', 'gpt-5-nano'];
    const isOpenAIModel = openaiModels.includes(model);

    if (isOpenAIModel) {
      // Use OpenAI
      if (!openaiApiKey) {
        return new Response(
          JSON.stringify({ 
            error: 'OpenAI API key not configured. Please contact your administrator.' 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Map model selection to actual OpenAI model names
      const modelMapping: Record<string, string> = {
        'gpt-5': 'gpt-5-2025-08-07',
        'gpt-5.2': 'gpt-5.2-2025-08-07',
        'gpt-5-mini': 'gpt-5-mini-2025-08-07',
        'gpt-5-nano': 'gpt-5-nano-2025-08-07',
      };
      const modelName = modelMapping[model] || 'gpt-5-mini-2025-08-07';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'user', content: prompt }
          ],
          max_completion_tokens: 8192,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('OpenAI API error:', errorData);
        throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
      }

      const data = await response.json();
      console.log('OpenAI API response received');

      generatedText = data.choices?.[0]?.message?.content || '';
      
      if (!generatedText) {
        console.error('Empty text in OpenAI response:', JSON.stringify(data));
        throw new Error('OpenAI API returned empty content.');
      }

    } else {
      // Use Gemini (default)
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

      // Determine which Gemini model to use
      // Available models: gemini-2.5-flash (GA), gemini-2.0-flash (GA), gemini-3-flash-preview (Preview)
      const geminiModelName = model === 'gemini-3' ? 'gemini-3-flash-preview' : 'gemini-2.5-flash';
      console.log('Using Gemini model:', geminiModelName);

      // Call Gemini API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModelName}:generateContent?key=${geminiApiKey}`,
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

      generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (!generatedText) {
        console.error('Empty text in Gemini response:', JSON.stringify(data));
        throw new Error('Gemini API returned empty content.');
      }
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
