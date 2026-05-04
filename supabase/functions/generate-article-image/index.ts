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

    const model = 'gemini-2.5-flash-image';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const calls = Array.from({ length: count }, () =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }).then(async (r) => {
        if (!r.ok) {
          const t = await r.text();
          console.error('Gemini error:', t);
          return null;
        }
        const data = await r.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          if (p.inlineData?.data) {
            return `data:${p.inlineData.mimeType || 'image/png'};base64,${p.inlineData.data}`;
          }
        }
        return null;
      }).catch((e) => { console.error(e); return null; })
    );

    const results = await Promise.all(calls);
    const images = results.filter(Boolean) as string[];

    if (images.length === 0) {
      return new Response(JSON.stringify({ error: 'No images generated' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
