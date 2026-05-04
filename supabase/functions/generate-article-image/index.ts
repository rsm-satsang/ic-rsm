import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const { prompt, count = 3 } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'Prompt required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const imageCount = Math.min(Math.max(Number(count) || 3, 1), 3);
    const models = [
      'gemini-2.5-flash-image-preview',
      'gemini-2.5-flash-image',
      'gemini-2.0-flash-preview-image-generation',
    ];

    const callOnce = async () => {
      for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          }),
        });
        if (!r.ok) {
          const t = await r.text();
          console.error('Gemini error:', model, r.status, t);
          continue;
        }
        const data = await r.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find((part: any) => part?.inlineData?.data || part?.inline_data?.data);
        const inlineData = imagePart?.inlineData || imagePart?.inline_data;
        if (inlineData?.data) {
          const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
          return `data:${mimeType};base64,${inlineData.data}`;
        }
        console.error('Gemini returned no inline image:', model, JSON.stringify(data).slice(0, 1000));
      }
      return null;
    };

    const results = await Promise.all(Array.from({ length: imageCount }, callOnce));
    const images = results.filter(Boolean) as string[];

    if (images.length === 0) {
      return new Response(JSON.stringify({ error: 'No images generated. Try again or refine your prompt.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ images }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    console.error('generate-article-image error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
