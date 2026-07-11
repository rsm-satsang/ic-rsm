import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import GlobalNav from "@/components/GlobalNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Upload, BookOpen, Download, Trash2, Plus } from "lucide-react";

interface Sop {
  id: string;
  title: string;
  category: string | null;
  content_type: string | null;
  owner: string | null;
  version: string | null;
  description: string | null;
  tags: string[] | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
}

const CATEGORIES = ["Planning", "Production", "Publishing", "Distribution", "Analytics", "Other"];
const CONTENT_TYPES = ["Newsletter", "Long-form Video", "Shorts/Reels", "Live Satsang Workshop", "Daily Inspiration", "General"];

export default function ContentSOPs() {
  const [sops, setSops] = useState<Sop[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [contentType, setContentType] = useState("");
  const [owner, setOwner] = useState("");
  const [version, setVersion] = useState("1.0");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("sops").select("*").order("created_at", { ascending: false });
    if (data) setSops(data as Sop[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const reset = () => {
    setTitle(""); setCategory(""); setContentType(""); setOwner("");
    setVersion("1.0"); setDescription(""); setTagsInput(""); setFile(null);
    setShowForm(false);
  };

  const submit = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!file) { toast.error("Please select an SOP file"); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const path = `${user?.id ?? "anon"}/${Date.now()}_${file.name}`;
      const up = await supabase.storage.from("sop-files").upload(path, file, { upsert: false });
      if (up.error) throw up.error;

      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      const { error } = await supabase.from("sops").insert({
        title: title.trim(),
        category: category || null,
        content_type: contentType || null,
        owner: owner.trim() || null,
        version: version.trim() || null,
        description: description.trim() || null,
        tags,
        file_path: path,
        file_name: file.name,
        file_mime: file.type,
        file_size: file.size,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success("SOP uploaded");
      reset();
      await load();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  const download = async (sop: Sop) => {
    if (!sop.file_path) return;
    const { data, error } = await supabase.storage.from("sop-files").createSignedUrl(sop.file_path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  const remove = async (sop: Sop) => {
    if (!confirm(`Delete SOP "${sop.title}"?`)) return;
    if (sop.file_path) await supabase.storage.from("sop-files").remove([sop.file_path]);
    await supabase.from("sops").delete().eq("id", sop.id);
    toast.success("Deleted");
    await load();
  };

  const fmtSize = (n: number | null) => {
    if (!n) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <div className="pl-16">
        <div className="container mx-auto px-6 py-8 max-w-7xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <BookOpen className="h-7 w-7" /> Content SOPs
              </h1>
              <p className="text-muted-foreground mt-1">Repository of Standard Operating Procedures for content routines.</p>
            </div>
            <Button onClick={() => setShowForm((s) => !s)} className="gap-2">
              <Plus className="h-4 w-4" /> New SOP
            </Button>
          </div>

          {showForm && (
            <Card className="p-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Title *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Newsletter draft-to-publish flow" />
                </div>
                <div>
                  <Label>Version</Label>
                  <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" />
                </div>
                <div>
                  <Label>Category</Label>
                  <select className="w-full border rounded-md h-10 px-2 bg-background" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">— select —</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Content Type</Label>
                  <select className="w-full border rounded-md h-10 px-2 bg-background" value={contentType} onChange={(e) => setContentType(e.target.value)}>
                    <option value="">— select —</option>
                    {CONTENT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Owner</Label>
                  <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Person or team" />
                </div>
                <div>
                  <Label>Tags (comma-separated)</Label>
                  <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="drafting, review" />
                </div>
                <div className="md:col-span-2">
                  <Label>Description</Label>
                  <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Purpose, scope, key steps..." />
                </div>
                <div className="md:col-span-2">
                  <Label>File *</Label>
                  <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={submit} disabled={submitting} className="gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload SOP
                </Button>
                <Button variant="ghost" onClick={reset}>Cancel</Button>
              </div>
            </Card>
          )}

          <div className="mb-3 flex items-baseline justify-between bg-sky-500 text-white rounded-md px-4 py-2">
            <h2 className="text-xl font-bold">SOP Library</h2>
            <span className="text-xs opacity-90">{sops.length} documents</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
          ) : sops.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">No SOPs uploaded yet.</Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sops.map((s) => (
                <Card key={s.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <div className="font-semibold text-sm leading-snug">{s.title}</div>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        {s.category && <Badge variant="secondary" className="text-xs">{s.category}</Badge>}
                        {s.content_type && <Badge variant="outline" className="text-xs">{s.content_type}</Badge>}
                        {s.version && <span className="text-xs text-muted-foreground">v{s.version}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => download(s)} title="Download">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(s)} title="Delete">
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">{s.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                    {s.owner && <span>Owner: <b>{s.owner}</b></span>}
                    {s.file_name && <span>· {s.file_name} {s.file_size ? `(${fmtSize(s.file_size)})` : ""}</span>}
                  </div>
                  {s.tags && s.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-2">
                      {s.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
