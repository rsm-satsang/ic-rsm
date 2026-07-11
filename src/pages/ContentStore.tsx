import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import GlobalNav from "@/components/GlobalNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Upload, Database, FileSpreadsheet, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

type FieldKey = "content_type" | "url" | "publish_date" | "title" | "transcript";
const FIELDS: { key: FieldKey; label: string }[] = [
  { key: "content_type", label: "Type (NL / LSW / ...)" },
  { key: "url", label: "URL" },
  { key: "publish_date", label: "Date" },
  { key: "title", label: "Title" },
  { key: "transcript", label: "Transcript" },
];

interface Item {
  id: string;
  content_type: string | null;
  url: string | null;
  publish_date: string | null;
  title: string | null;
  transcript: string | null;
  source_file_path: string | null;
  created_at: string;
}

function guessMap(headers: string[]): Record<FieldKey, string> {
  const lc = headers.map((h) => h.toLowerCase());
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const idx = lc.findIndex((h) => h.includes(k));
      if (idx >= 0) return headers[idx];
    }
    return "";
  };
  return {
    content_type: pick("type", "category"),
    url: pick("url", "link"),
    publish_date: pick("date", "publish"),
    title: pick("title", "name", "subject"),
    transcript: pick("transcript", "body", "content", "text"),
  };
}

function excelDateToISO(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const s = String(v).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s || null;
}

export default function ContentStore() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    content_type: "", url: "", publish_date: "", title: "", transcript: "",
  });
  const [importing, setImporting] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("content_items")
      .select("*")
      .order("publish_date", { ascending: false, nullsFirst: false });
    if (data) setItems(data as Item[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const onFile = async (f: File) => {
    setFile(f);
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
    if (!json.length) { toast.error("Sheet is empty"); return; }
    const hdrs = Object.keys(json[0]);
    setHeaders(hdrs);
    setRows(json);
    setMapping(guessMap(hdrs));
  };

  const doImport = async () => {
    if (!file || !rows) return;
    if (!mapping.title && !mapping.url) { toast.error("Map at least Title or URL"); return; }
    setImporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Upload preserved file
      const path = `${user?.id ?? "anon"}/${Date.now()}_${file.name}`;
      const up = await supabase.storage.from("content-store").upload(path, file, { upsert: false });
      if (up.error) throw up.error;

      // Replace all content
      await supabase.from("content_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const payload = rows.map((r) => ({
        content_type: mapping.content_type ? String(r[mapping.content_type] ?? "").trim() || null : null,
        url: mapping.url ? String(r[mapping.url] ?? "").trim() || null : null,
        publish_date: mapping.publish_date ? excelDateToISO(r[mapping.publish_date]) : null,
        title: mapping.title ? String(r[mapping.title] ?? "").trim() || null : null,
        transcript: mapping.transcript ? String(r[mapping.transcript] ?? "").trim() || null : null,
        source_file_path: path,
        created_by: user?.id ?? null,
      }));

      // insert in chunks of 500
      for (let i = 0; i < payload.length; i += 500) {
        const chunk = payload.slice(i, i + 500);
        const { error } = await supabase.from("content_items").insert(chunk);
        if (error) throw error;
      }

      toast.success(`Imported ${payload.length} rows`);
      setFile(null); setRows(null); setHeaders([]);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const downloadOriginal = async (path: string) => {
    const { data, error } = await supabase.storage.from("content-store").createSignedUrl(path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  const latestFile = useMemo(() => items.find((i) => i.source_file_path)?.source_file_path ?? null, [items]);

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <div className="pl-14">
        <div className="container mx-auto px-6 py-8 max-w-7xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Database className="h-7 w-7" /> Content Store
              </h1>
              <p className="text-muted-foreground mt-1">Upload an Excel sheet — each row becomes a content card.</p>
            </div>
            {latestFile && (
              <Button variant="outline" onClick={() => downloadOriginal(latestFile)} className="gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Download latest file
              </Button>
            )}
          </div>

          <Card className="p-4 mb-6">
            <Label className="text-sm font-medium">Upload Excel (.xlsx / .xls / .csv)</Label>
            <div className="mt-2 flex items-center gap-3">
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                className="max-w-md"
              />
              <span className="text-xs text-muted-foreground">
                Uploading replaces existing content. Original file is preserved.
              </span>
            </div>

            {rows && (
              <div className="mt-4">
                <div className="text-sm font-medium mb-2">Map your columns → content fields</div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {FIELDS.map((f) => (
                    <div key={f.key}>
                      <Label className="text-xs">{f.label}</Label>
                      <Select
                        value={mapping[f.key] || "__none__"}
                        onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === "__none__" ? "" : v }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— none —</SelectItem>
                          {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2 items-center">
                  <Button onClick={doImport} disabled={importing} className="gap-2">
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Import {rows.length} rows (replaces all)
                  </Button>
                  <Button variant="ghost" onClick={() => { setFile(null); setRows(null); setHeaders([]); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <div className="mb-3 flex items-baseline justify-between bg-sky-500 text-white rounded-md px-4 py-2">
            <h2 className="text-xl font-bold">Content Cards</h2>
            <span className="text-xs opacity-90">{items.length} rows</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
          ) : items.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">No content yet — upload a sheet above.</Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map((it) => {
                const open = expanded[it.id];
                const preview = (it.transcript ?? "").slice(0, 220);
                return (
                  <Card key={it.id} className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {it.content_type && (
                            <Badge variant="secondary" className="text-xs">{it.content_type}</Badge>
                          )}
                          {it.publish_date && (
                            <span className="text-xs text-muted-foreground tabular-nums">{it.publish_date}</span>
                          )}
                        </div>
                        <div className="font-semibold text-sm leading-snug">
                          {it.title ?? "(untitled)"}
                        </div>
                      </div>
                      {it.url && (
                        <a href={it.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline shrink-0">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                    {it.transcript && (
                      <div className="mt-2">
                        <button
                          onClick={() => setExpanded((e) => ({ ...e, [it.id]: !open }))}
                          className="text-xs text-sky-700 hover:underline flex items-center gap-1"
                        >
                          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          Transcript
                        </button>
                        <div className={`text-xs text-muted-foreground mt-1 whitespace-pre-wrap ${open ? "" : "line-clamp-3"}`}>
                          {open ? it.transcript : preview + (it.transcript.length > 220 ? "…" : "")}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
