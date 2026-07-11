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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Upload, Database, FileSpreadsheet, ChevronDown, ChevronRight, ExternalLink, Search, X, FileText, Scissors } from "lucide-react";

type FieldKey =
  | "content_type"
  | "url"
  | "publish_date"
  | "title"
  | "transcript"
  | "description"
  | "tags"
  | "social_clips"
  | "content_code";

const FIELDS: { key: FieldKey; label: string; extra?: boolean }[] = [
  { key: "content_type", label: "Type (NL / LSW / ...)" },
  { key: "content_code", label: "Content Code", extra: true },
  { key: "url", label: "URL" },
  { key: "publish_date", label: "Date" },
  { key: "title", label: "Title" },
  { key: "description", label: "Description", extra: true },
  { key: "tags", label: "Tags / Themes", extra: true },
  { key: "social_clips", label: "Social Clips", extra: true },
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
  extra: any;
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
    content_code: pick("code", "id"),
    url: pick("url", "link"),
    publish_date: pick("date", "publish"),
    title: pick("title", "name", "subject"),
    description: pick("description", "summary", "abstract"),
    tags: pick("tag", "theme", "topic"),
    social_clips: pick("social", "clip", "reel", "short"),
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

function parseTags(v: any): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  return String(v)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ContentStore() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    content_type: "", content_code: "", url: "", publish_date: "", title: "",
    description: "", tags: "", social_clips: "", transcript: "",
  });
  const [importing, setImporting] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Filters
  const [titleQuery, setTitleQuery] = useState("");
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [codeQuery, setCodeQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("__all__");

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
      const path = `${user?.id ?? "anon"}/${Date.now()}_${file.name}`;
      const up = await supabase.storage.from("content-store").upload(path, file, { upsert: false });
      if (up.error) throw up.error;

      await supabase.from("content_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const payload = rows.map((r) => {
        const extra: Record<string, any> = {};
        if (mapping.content_code) extra.content_code = String(r[mapping.content_code] ?? "").trim() || null;
        if (mapping.description) extra.description = String(r[mapping.description] ?? "").trim() || null;
        if (mapping.tags) extra.tags = parseTags(r[mapping.tags]);
        if (mapping.social_clips) extra.social_clips = String(r[mapping.social_clips] ?? "").trim() || null;
        return {
          content_type: mapping.content_type ? String(r[mapping.content_type] ?? "").trim() || null : null,
          url: mapping.url ? String(r[mapping.url] ?? "").trim() || null : null,
          publish_date: mapping.publish_date ? excelDateToISO(r[mapping.publish_date]) : null,
          title: mapping.title ? String(r[mapping.title] ?? "").trim() || null : null,
          transcript: mapping.transcript ? String(r[mapping.transcript] ?? "").trim() || null : null,
          source_file_path: path,
          created_by: user?.id ?? null,
          extra: Object.keys(extra).length ? extra : null,
        };
      });

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

  const allTypes = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => i.content_type && s.add(i.content_type));
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const tq = titleQuery.trim().toLowerCase();
    const trq = transcriptQuery.trim().toLowerCase();
    const tagq = tagQuery.trim().toLowerCase();
    const cq = codeQuery.trim().toLowerCase();
    return items.filter((it) => {
      if (typeFilter !== "__all__" && it.content_type !== typeFilter) return false;
      if (dateFrom && (!it.publish_date || it.publish_date < dateFrom)) return false;
      if (dateTo && (!it.publish_date || it.publish_date > dateTo)) return false;
      if (tq && !(it.title ?? "").toLowerCase().includes(tq)) return false;
      if (trq && !(it.transcript ?? "").toLowerCase().includes(trq)) return false;
      if (cq) {
        const code = String(it.extra?.content_code ?? "").toLowerCase();
        if (!code.includes(cq)) return false;
      }
      if (tagq) {
        const tags: string[] = Array.isArray(it.extra?.tags) ? it.extra.tags : [];
        const hay = [...tags, String(it.extra?.description ?? "")].join(" ").toLowerCase();
        if (!hay.includes(tagq)) return false;
      }
      return true;
    });
  }, [items, titleQuery, transcriptQuery, tagQuery, codeQuery, dateFrom, dateTo, typeFilter]);

  const clearFilters = () => {
    setTitleQuery(""); setTranscriptQuery(""); setTagQuery(""); setCodeQuery("");
    setDateFrom(""); setDateTo(""); setTypeFilter("__all__");
  };
  const hasFilters =
    titleQuery || transcriptQuery || tagQuery || codeQuery || dateFrom || dateTo || typeFilter !== "__all__";

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
                      <Label className="text-xs">
                        {f.label}
                        {f.extra && <span className="text-muted-foreground ml-1">(extra)</span>}
                      </Label>
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

          {/* Filters */}
          <Card className="p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium flex items-center gap-2">
                <Search className="h-4 w-4" /> Filters
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                  <X className="h-3 w-3" /> Clear
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Title contains</Label>
                <Input value={titleQuery} onChange={(e) => setTitleQuery(e.target.value)} placeholder="e.g. bhakti" />
              </div>
              <div>
                <Label className="text-xs">Transcript keyword</Label>
                <Input value={transcriptQuery} onChange={(e) => setTranscriptQuery(e.target.value)} placeholder="search transcript…" />
              </div>
              <div>
                <Label className="text-xs">Tag / Theme</Label>
                <Input value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} placeholder="e.g. meditation" />
              </div>
              <div>
                <Label className="text-xs">Content Code (partial)</Label>
                <Input value={codeQuery} onChange={(e) => setCodeQuery(e.target.value)} placeholder="e.g. NL-045" />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All types</SelectItem>
                    {allTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Date from</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Date to</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          </Card>

          <div className="mb-3 flex items-baseline justify-between bg-sky-500 text-white rounded-md px-4 py-2">
            <h2 className="text-xl font-bold">Content Cards</h2>
            <span className="text-xs opacity-90">
              {filtered.length} of {items.length} rows
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
          ) : filtered.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              {items.length === 0 ? "No content yet — upload a sheet above." : "No cards match the current filters."}
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((it) => {
                const open = expanded[it.id];
                const preview = (it.transcript ?? "").slice(0, 220);
                const code = it.extra?.content_code as string | undefined;
                const desc = it.extra?.description as string | undefined;
                const tags: string[] = Array.isArray(it.extra?.tags) ? it.extra.tags : [];
                const social = it.extra?.social_clips as string | undefined;
                return (
                  <Card key={it.id} className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {it.content_type && (
                            <Badge variant="secondary" className="text-xs">{it.content_type}</Badge>
                          )}
                          {code && (
                            <Badge variant="outline" className="text-xs font-mono">{code}</Badge>
                          )}
                          {it.publish_date && (
                            <span className="text-xs text-muted-foreground tabular-nums">{it.publish_date}</span>
                          )}
                        </div>
                        <div className="font-semibold text-sm leading-snug">
                          {it.title ?? "(untitled)"}
                        </div>
                        {desc && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{desc}</div>
                        )}
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {tags.map((t, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">{t}</Badge>
                            ))}
                          </div>
                        )}
                        {social && (
                          <div className="text-xs mt-2">
                            <span className="font-medium text-muted-foreground">Social clips: </span>
                            <span className="whitespace-pre-wrap">{social}</span>
                          </div>
                        )}
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
