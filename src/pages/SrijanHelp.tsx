import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import GlobalNav from "@/components/GlobalNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Upload, Pencil, Plus, Trash2, BookOpen, Video, ChevronDown, ChevronRight, Play } from "lucide-react";

interface FAQ { id: string; question: string; answer: string; }
interface HelpVideo { id: string; title: string; video_url: string | null; storage_path: string | null; created_at: string; }

export default function SrijanHelp() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [videos, setVideos] = useState<HelpVideo[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const [showNewFaq, setShowNewFaq] = useState(false);
  const [newFaq, setNewFaq] = useState({ question: "", answer: "" });
  const [editFaqId, setEditFaqId] = useState<string | null>(null);
  const [faqDraft, setFaqDraft] = useState({ question: "", answer: "" });

  const [videoTitle, setVideoTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);
    if (user) {
      const { data } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
      setIsAdmin((data as any)?.role === "admin");
    }
    await Promise.all([loadFaqs(), loadVideos()]);
    setLoading(false);
  })(); }, []);

  const loadFaqs = async () => {
    const { data } = await supabase.from("help_faqs").select("*").order("created_at", { ascending: false });
    if (data) setFaqs(data as any);
  };
  const loadVideos = async () => {
    const { data } = await supabase.from("help_videos").select("*").order("created_at", { ascending: false });
    if (data) setVideos(data as any);
  };

  const addFaq = async () => {
    if (!newFaq.question.trim() || !newFaq.answer.trim()) return;
    const { data, error } = await supabase.from("help_faqs").insert({ ...newFaq, created_by: userId }).select().single();
    if (error) return toast.error(error.message);
    setFaqs((f) => [data as any, ...f]);
    setNewFaq({ question: "", answer: "" });
    setShowNewFaq(false);
  };
  const saveFaq = async (id: string) => {
    const { error } = await supabase.from("help_faqs").update(faqDraft).eq("id", id);
    if (error) return toast.error(error.message);
    setFaqs((f) => f.map((x) => (x.id === id ? { ...x, ...faqDraft } : x)));
    setEditFaqId(null);
  };
  const deleteFaq = async (id: string) => {
    if (!confirm("Delete this FAQ?")) return;
    const { error } = await supabase.from("help_faqs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setFaqs((f) => f.filter((x) => x.id !== id));
  };

  const uploadVideo = async (file: File) => {
    if (!isAdmin) return;
    if (!videoTitle.trim()) { toast.error("Enter a title first"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "mp4";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("help-videos").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data, error } = await supabase.from("help_videos").insert({
        title: videoTitle, storage_path: path, uploaded_by: userId,
      }).select().single();
      if (error) throw error;
      setVideos((v) => [data as any, ...v]);
      setVideoTitle("");
      toast.success("Video uploaded");
    } catch (e: any) { toast.error(e.message); } finally { setUploading(false); }
  };

  const deleteVideo = async (v: HelpVideo) => {
    if (!confirm("Delete this video?")) return;
    if (v.storage_path) await supabase.storage.from("help-videos").remove([v.storage_path]);
    const { error } = await supabase.from("help_videos").delete().eq("id", v.id);
    if (error) return toast.error(error.message);
    setVideos((xs) => xs.filter((x) => x.id !== v.id));
  };

  const playVideo = async (v: HelpVideo) => {
    if (signedUrls[v.id]) { setExpanded((e) => ({ ...e, [`v:${v.id}`]: !e[`v:${v.id}`] })); return; }
    if (v.storage_path) {
      const { data } = await supabase.storage.from("help-videos").createSignedUrl(v.storage_path, 3600);
      if (data?.signedUrl) {
        setSignedUrls((s) => ({ ...s, [v.id]: data.signedUrl }));
        setExpanded((e) => ({ ...e, [`v:${v.id}`]: true }));
      }
    } else if (v.video_url) {
      setSignedUrls((s) => ({ ...s, [v.id]: v.video_url! }));
      setExpanded((e) => ({ ...e, [`v:${v.id}`]: true }));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <div className="pl-14">
        <div className="container mx-auto px-6 py-8 max-w-5xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BookOpen className="h-7 w-7 text-sky-500" /> Srijan Help Videos / FAQs
            </h1>
            <p className="text-muted-foreground mt-1">Learn how to use Srijan — videos and answers.</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* FAQs */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">FAQs</h2>
                  {isAdmin && (
                    <Button size="sm" onClick={() => setShowNewFaq((v) => !v)} className="gap-1 bg-sky-500 hover:bg-sky-600">
                      <Plus className="h-4 w-4" /> Add FAQ
                    </Button>
                  )}
                </div>

                {showNewFaq && isAdmin && (
                  <Card className="p-3 mb-3 border-sky-300">
                    <Label className="text-xs">Question</Label>
                    <Input value={newFaq.question} onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })} />
                    <Label className="text-xs mt-2 block">Answer</Label>
                    <Textarea rows={4} value={newFaq.answer} onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })} />
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={addFaq} className="bg-sky-500 hover:bg-sky-600">Add</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowNewFaq(false)}>Cancel</Button>
                    </div>
                  </Card>
                )}

                <div className="space-y-2">
                  {faqs.length === 0 ? (
                    <Card className="p-6 text-center text-muted-foreground text-sm">No FAQs yet.</Card>
                  ) : faqs.map((f) => {
                    const open = !!expanded[`f:${f.id}`];
                    return (
                      <Card key={f.id} className="p-3">
                        {editFaqId === f.id ? (
                          <div className="space-y-2">
                            <Input value={faqDraft.question} onChange={(e) => setFaqDraft({ ...faqDraft, question: e.target.value })} />
                            <Textarea rows={4} value={faqDraft.answer} onChange={(e) => setFaqDraft({ ...faqDraft, answer: e.target.value })} />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => saveFaq(f.id)} className="bg-sky-500 hover:bg-sky-600">Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditFaqId(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start gap-2">
                              <button
                                onClick={() => setExpanded((e) => ({ ...e, [`f:${f.id}`]: !open }))}
                                className="flex-1 text-left flex items-start gap-2"
                              >
                                {open ? <ChevronDown className="h-4 w-4 mt-0.5 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                                <span className="font-medium text-sm">{f.question}</span>
                              </button>
                              {isAdmin && (
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditFaqId(f.id); setFaqDraft({ question: f.question, answer: f.answer }); }}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteFaq(f.id)}>
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            {open && <p className="text-sm mt-2 pl-6 whitespace-pre-wrap text-foreground/90">{f.answer}</p>}
                          </>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Videos */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-semibold flex items-center gap-2"><Video className="h-5 w-5" /> Videos</h2>
                </div>

                {isAdmin && (
                  <Card className="p-3 mb-3 border-sky-300">
                    <Label className="text-xs">Video title</Label>
                    <Input value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} placeholder="e.g. How to create a new draft" />
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])}
                    />
                    <Button
                      size="sm"
                      className="mt-2 gap-1 bg-sky-500 hover:bg-sky-600"
                      onClick={() => videoInputRef.current?.click()}
                      disabled={uploading || !videoTitle.trim()}
                    >
                      {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      Upload Video
                    </Button>
                  </Card>
                )}

                <div className="space-y-2">
                  {videos.length === 0 ? (
                    <Card className="p-6 text-center text-muted-foreground text-sm">No videos yet.</Card>
                  ) : videos.map((v) => {
                    const open = !!expanded[`v:${v.id}`];
                    return (
                      <Card key={v.id} className="p-3">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {new Date(v.created_at).toLocaleDateString()}
                            </div>
                            <div className="font-medium text-sm">{v.title}</div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => playVideo(v)} className="gap-1">
                            <Play className="h-3 w-3" /> {open ? "Hide" : "Play"}
                          </Button>
                          {isAdmin && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteVideo(v)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                        {open && signedUrls[v.id] && (
                          <video src={signedUrls[v.id]} controls className="w-full mt-2 rounded" />
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
