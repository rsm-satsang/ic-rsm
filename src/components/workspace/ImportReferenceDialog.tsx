import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, Database, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDate } from "@/lib/datetime";

export interface ImportedRef {
  id: string;
  title: string;
  text: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentProjectId?: string;
  onImport: (refs: ImportedRef[]) => void;
}

type ContentItem = {
  id: string;
  title: string | null;
  content_type: string | null;
  publish_date: string | null;
  url: string | null;
  transcript: string | null;
  extra: any;
};

type ProjectRow = {
  id: string;
  title: string;
  type: string;
  updated_at: string;
};

function buildContentText(it: ContentItem): string {
  const parts: string[] = [];
  if (it.title) parts.push(`# ${it.title}`);
  const code = it.extra?.content_code;
  const tags = Array.isArray(it.extra?.tags) ? (it.extra.tags as string[]) : [];
  const meta: string[] = [];
  if (it.content_type) meta.push(`Type: ${it.content_type}`);
  if (code) meta.push(`Code: ${code}`);
  if (it.publish_date) meta.push(`Date: ${it.publish_date}`);
  if (tags.length) meta.push(`Tags: ${tags.join(", ")}`);
  if (meta.length) parts.push(meta.join(" · "));
  if (it.url) parts.push(`Source URL: ${it.url}`);
  if (it.extra?.description) parts.push(`\n**Description**\n${it.extra.description}`);
  if (it.extra?.social_clips) parts.push(`\n**Social clips**\n${it.extra.social_clips}`);
  if (it.transcript) parts.push(`\n**Transcript**\n${it.transcript}`);
  return parts.join("\n\n");
}

export default function ImportReferenceDialog({ open, onOpenChange, currentProjectId, onImport }: Props) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [q, setQ] = useState("");
  const [pq, setPq] = useState("");
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const [selectedProjects, setSelectedProjects] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedItems({});
    setSelectedProjects({});
    (async () => {
      const [ci, pr] = await Promise.all([
        supabase.from("content_items").select("id,title,content_type,publish_date,url,transcript,extra").order("publish_date", { ascending: false, nullsFirst: false }).limit(500),
        supabase.from("projects").select("id,title,type,updated_at").order("updated_at", { ascending: false }).limit(200),
      ]);
      if (ci.data) setItems(ci.data as ContentItem[]);
      if (pr.data) setProjects((pr.data as ProjectRow[]).filter(p => p.id !== currentProjectId));
      setLoading(false);
    })();
  }, [open, currentProjectId]);

  const filteredItems = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => {
      const hay = [it.title, it.content_type, it.extra?.content_code, ...(Array.isArray(it.extra?.tags) ? it.extra.tags : []), it.extra?.description]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(s);
    });
  }, [items, q]);

  const filteredProjects = useMemo(() => {
    const s = pq.trim().toLowerCase();
    if (!s) return projects;
    return projects.filter((p) => (p.title || "").toLowerCase().includes(s));
  }, [projects, pq]);

  const doImport = async () => {
    const refs: ImportedRef[] = [];
    // content items
    const chosenItems = filteredItems.filter((i) => selectedItems[i.id]);
    for (const it of chosenItems) {
      refs.push({
        id: crypto.randomUUID(),
        title: `Content Card: ${it.title || it.extra?.content_code || "(untitled)"}`,
        text: buildContentText(it),
      });
    }
    // projects — fetch latest version each
    const chosenProjectIds = Object.entries(selectedProjects).filter(([, v]) => v).map(([k]) => k);
    if (chosenProjectIds.length) {
      const { data: versions } = await supabase
        .from("versions")
        .select("project_id,title,content,version_number,created_at")
        .in("project_id", chosenProjectIds)
        .order("version_number", { ascending: false });
      const byProject: Record<string, any> = {};
      (versions || []).forEach((v: any) => { if (!byProject[v.project_id]) byProject[v.project_id] = v; });
      chosenProjectIds.forEach((pid) => {
        const project = projects.find((p) => p.id === pid);
        const v = byProject[pid];
        const html = v?.content || "";
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        tmp.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
        tmp.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote").forEach((el) => el.append("\n\n"));
        const text = (tmp.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
        refs.push({
          id: crypto.randomUUID(),
          title: `From Project: ${project?.title || pid} — ${v?.title || "latest"}`,
          text: text || "(no content in latest version)",
        });
      });
    }

    if (refs.length === 0) {
      toast.error("Select at least one item to import");
      return;
    }
    onImport(refs);
    toast.success(`Imported ${refs.length} reference(s)`);
    onOpenChange(false);
  };

  const selCount = Object.values(selectedItems).filter(Boolean).length + Object.values(selectedProjects).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import references from existing content</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="content">
          <TabsList>
            <TabsTrigger value="content"><Database className="h-4 w-4 mr-1" /> Content Store</TabsTrigger>
            <TabsTrigger value="projects"><FolderOpen className="h-4 w-4 mr-1" /> Existing Projects</TabsTrigger>
          </TabsList>

          <TabsContent value="content">
            <div className="flex items-center gap-2 mb-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, tags, code…" />
            </div>
            <ScrollArea className="h-80 border rounded">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin h-5 w-5" /></div>
              ) : filteredItems.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">No content items found.</div>
              ) : (
                <ul className="divide-y">
                  {filteredItems.map((it) => (
                    <li key={it.id} className="p-2 flex items-start gap-2 hover:bg-muted/40">
                      <Checkbox
                        checked={!!selectedItems[it.id]}
                        onCheckedChange={(v) => setSelectedItems((s) => ({ ...s, [it.id]: !!v }))}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {it.content_type && <Badge variant="secondary" className="text-[10px]">{it.content_type}</Badge>}
                          {it.extra?.content_code && <Badge variant="outline" className="text-[10px] font-mono">{it.extra.content_code}</Badge>}
                          {it.publish_date && <span className="text-[10px] text-muted-foreground">{it.publish_date}</span>}
                        </div>
                        <div className="text-sm font-medium truncate">{it.title || "(untitled)"}</div>
                        {it.extra?.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">{it.extra.description}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="projects">
            <div className="flex items-center gap-2 mb-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Search projects…" />
            </div>
            <ScrollArea className="h-80 border rounded">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin h-5 w-5" /></div>
              ) : filteredProjects.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">No projects found.</div>
              ) : (
                <ul className="divide-y">
                  {filteredProjects.map((p) => (
                    <li key={p.id} className="p-2 flex items-start gap-2 hover:bg-muted/40">
                      <Checkbox
                        checked={!!selectedProjects[p.id]}
                        onCheckedChange={(v) => setSelectedProjects((s) => ({ ...s, [p.id]: !!v }))}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.title}</div>
                        <div className="text-[11px] text-muted-foreground">{p.type} · {formatDate(p.updated_at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={doImport} disabled={selCount === 0}>
            Import {selCount > 0 ? `(${selCount})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
