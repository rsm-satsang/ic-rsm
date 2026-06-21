import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DRIVE = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const SHEETS = "https://connector-gateway.lovable.dev/google_sheets/v4";

const FILE_NAME = "RSMContentStore";
const SHEET_NAME = "NL-SBS-2026";

function gwHeaders() {
  return {
    Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    "X-Connection-Api-Key": Deno.env.get("GOOGLE_DRIVE_API_KEY") ?? "",
  };
}
function sheetsHeaders() {
  return {
    Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
    "X-Connection-Api-Key": Deno.env.get("GOOGLE_SHEETS_API_KEY") ?? "",
  };
}

function mondayOf(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}
function firstMondayOfYear(year: number): string {
  const d = new Date(Date.UTC(year, 0, 1));
  const day = d.getUTCDay();
  const off = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  d.setUTCDate(d.getUTCDate() + off);
  return d.toISOString().slice(0, 10);
}

function parseDate(v: any): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    // Sheets serial date
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  // try dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [_, a, b, y] = m;
    if (y.length === 2) y = "20" + y;
    d = new Date(Date.UTC(Number(y), Number(b) - 1, Number(a)));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { channel = "substack_satsang", year = 2026 } = await req.json().catch(() => ({}));

    // 1. find file in Drive (mine + sharedWithMe)
    const q = encodeURIComponent(`name='${FILE_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
    const driveResp = await fetch(
      `${DRIVE}/files?q=${q}&fields=files(id,name)&pageSize=10&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives`,
      { headers: gwHeaders() }
    );
    const driveText = await driveResp.text();
    if (!driveResp.ok) throw new Error(`Drive search failed [${driveResp.status}]: ${driveText}`);
    const driveJson = JSON.parse(driveText);
    const file = driveJson.files?.[0];
    if (!file) {
      return new Response(
        JSON.stringify({
          error: `Spreadsheet "${FILE_NAME}" not found. Please share it with the connected Google account.`,
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. read the sheet values
    const range = encodeURIComponent(`${SHEET_NAME}!A1:Z1000`);
    const sheetResp = await fetch(
      `${SHEETS}/spreadsheets/${file.id}/values/${SHEET_NAME}!A1:Z1000?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: sheetsHeaders() }
    );
    const sheetText = await sheetResp.text();
    if (!sheetResp.ok) throw new Error(`Sheets read failed [${sheetResp.status}]: ${sheetText}`);
    const sheetJson = JSON.parse(sheetText);
    const rows: any[][] = sheetJson.values ?? [];
    if (rows.length < 2) {
      return new Response(JSON.stringify({ ok: true, imported: 0, skipped: 0, message: "Empty sheet" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. detect header columns
    const header = rows[0].map((h) => String(h || "").trim().toLowerCase());
    const findCol = (...names: string[]) =>
      header.findIndex((h) => names.some((n) => h === n || h.includes(n)));
    const titleCol = findCol("title", "post", "article", "name", "subject");
    const dateCol = findCol("publish date", "published", "date", "publish_date");
    const urlCol = findCol("url", "link");

    if (titleCol < 0 || dateCol < 0) {
      return new Response(
        JSON.stringify({
          error: `Could not find required columns. Sheet header: ${JSON.stringify(header)}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const firstMonday = firstMondayOfYear(Number(year));
    let imported = 0, skipped = 0;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const title = String(r[titleCol] ?? "").trim();
      const pubRaw = r[dateCol];
      const url = urlCol >= 0 ? String(r[urlCol] ?? "").trim() : "";
      const pub = parseDate(pubRaw);
      if (!title || !pub) { skipped++; continue; }
      if (pub.getUTCFullYear() !== Number(year)) { skipped++; continue; }

      let week = mondayOf(pub);
      if (week < firstMonday) week = firstMonday;

      const row = {
        channel,
        sub_channel: "newsletter",
        week_start_date: week,
        title,
        publish_date: pub.toISOString().slice(0, 10),
        status: "published",
        source: "gdrive",
        source_url: url || null,
      };

      const { error } = await supabase
        .from("tracker_entries")
        .upsert(row, { onConflict: "channel,sub_channel,week_start_date,source_url" });
      if (error) {
        const ins = await supabase.from("tracker_entries").insert(row);
        if (ins.error && !String(ins.error.message).includes("duplicate")) {
          console.error("insert err", ins.error);
          skipped++;
          continue;
        }
      }
      imported++;
    }

    return new Response(
      JSON.stringify({ ok: true, imported, skipped, totalRows: rows.length - 1, fileId: file.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
