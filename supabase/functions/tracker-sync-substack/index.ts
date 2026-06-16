import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function mondayOf(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function extractItems(xml: string): Array<{ title: string; link: string; pubDate: string }> {
  const items: Array<{ title: string; link: string; pubDate: string }> = [];
  const itemRe = /<item[\s\S]*?<\/item>/g;
  const blocks = xml.match(itemRe) || [];
  for (const block of blocks) {
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (titleMatch && linkMatch && dateMatch) {
      items.push({
        title: titleMatch[1].trim(),
        link: linkMatch[1].trim(),
        pubDate: dateMatch[1].trim(),
      });
    }
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { feedUrl, channel, year = 2026 } = await req.json();
    if (!feedUrl || !channel) {
      return new Response(JSON.stringify({ error: "feedUrl and channel are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Substack RSS lives at /feed
    const url = feedUrl.replace(/\/+$/, "") + "/feed";
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 LovableTracker" } });
    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch RSS: ${resp.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const xml = await resp.text();
    const items = extractItems(xml);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let imported = 0;
    let skipped = 0;
    for (const item of items) {
      const pub = new Date(item.pubDate);
      if (Number.isNaN(pub.getTime())) { skipped++; continue; }
      if (pub.getUTCFullYear() !== Number(year)) { skipped++; continue; }
      const week = mondayOf(pub);

      // upsert by (channel, sub_channel, week_start_date, source_url)
      const { error } = await supabase.from("tracker_entries").upsert(
        {
          channel,
          sub_channel: "newsletter",
          week_start_date: week,
          title: item.title,
          publish_date: pub.toISOString().slice(0, 10),
          status: "published",
          source: "substack",
          source_url: item.link,
        },
        { onConflict: "channel,sub_channel,week_start_date,source_url" }
      );
      if (error) {
        // fallback: try insert; ignore unique violations
        const ins = await supabase.from("tracker_entries").insert({
          channel,
          sub_channel: "newsletter",
          week_start_date: week,
          title: item.title,
          publish_date: pub.toISOString().slice(0, 10),
          status: "published",
          source: "substack",
          source_url: item.link,
        });
        if (ins.error && !String(ins.error.message).includes("duplicate")) {
          console.error("insert error", ins.error);
        }
      }
      imported++;
    }

    return new Response(
      JSON.stringify({ ok: true, imported, skipped, totalItems: items.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
