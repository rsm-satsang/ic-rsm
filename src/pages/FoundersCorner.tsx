import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import GlobalNav from "@/components/GlobalNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Upload, Pencil, Save, Plus, Trash2, X, Sparkles } from "lucide-react";

interface FounderContent {
  id?: string;
  photo_url: string | null;
  vision_note: string | null;
}
interface Message {
  id: string;
  title: string;
  message: string;
  message_date: string;
  created_at: string;
}

export default function FoundersCorner() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<FounderContent>({ photo_url: null, vision_note: null });
  const [messages, setMessages] = useState<Message[]>([]);
  const [editingVision, setEditingVision] = useState(false);
  const [visionDraft, setVisionDraft] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingVision, setSavingVision] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [showNewMsg, setShowNewMsg] = useState(false);
  const [newMsg, setNewMsg] = useState({ title: "", message: "", message_date: new Date().toISOString().slice(0, 10) });
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [msgDraft, setMsgDraft] = useState({ title: "", message: "", message_date: "" });

  useEffect(() => { (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);
    if (user) {
      const { data } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
      setIsAdmin((data as any)?.role === "admin");
    }
    await Promise.all([loadContent(), loadMessages()]);
    setLoading(false);
  })(); }, []);

  const loadContent = async () => {
    const { data } = await supabase.from("founder_content").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (data) setContent(data as any);
  };
  const loadMessages = async () => {
    const { data } = await supabase.from("founder_messages").select("*").order("message_date", { ascending: false });
    if (data) setMessages(data as any);
  };

  const saveVision = async () => {
    if (!isAdmin) return;
    setSavingVision(true);
    try {
      if (content.id) {
        const { error } = await supabase.from("founder_content").update({ vision_note: visionDraft, updated_by: userId }).eq("id", content.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("founder_content").insert({ vision_note: visionDraft, updated_by: userId }).select().single();
        if (error) throw error;
        setContent(data as any);
      }
      setContent((c) => ({ ...c, vision_note: visionDraft }));
      setEditingVision(false);
      toast.success("Vision note saved");
    } catch (e: any) { toast.error(e.message); } finally { setSavingVision(false); }
  };

  const uploadPhoto = async (file: File) => {
    if (!isAdmin) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `founder/photo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("project-images").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("project-images").getPublicUrl(path);
      const url = pub.publicUrl;
      if (content.id) {
        await supabase.from("founder_content").update({ photo_url: url, updated_by: userId }).eq("id", content.id);
      } else {
        const { data } = await supabase.from("founder_content").insert({ photo_url: url, updated_by: userId }).select().single();
        if (data) setContent(data as any);
      }
      setContent((c) => ({ ...c, photo_url: url }));
      toast.success("Photo updated");
    } catch (e: any) { toast.error(e.message); } finally { setUploadingPhoto(false); }
  };

  const addMessage = async () => {
    if (!isAdmin || !newMsg.title.trim() || !newMsg.message.trim()) return;
    const { data, error } = await supabase.from("founder_messages").insert({ ...newMsg, created_by: userId }).select().single();
    if (error) return toast.error(error.message);
    setMessages((m) => [data as any, ...m]);
    setNewMsg({ title: "", message: "", message_date: new Date().toISOString().slice(0, 10) });
    setShowNewMsg(false);
    toast.success("Message added");
  };
  const saveMessage = async (id: string) => {
    const { error } = await supabase.from("founder_messages").update(msgDraft).eq("id", id);
    if (error) return toast.error(error.message);
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, ...msgDraft } as Message : x)));
    setEditingMsgId(null);
    toast.success("Saved");
  };
  const deleteMessage = async (id: string) => {
    if (!confirm("Delete this message?")) return;
    const { error } = await supabase.from("founder_messages").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setMessages((m) => m.filter((x) => x.id !== id));
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <div className="pl-16">
        <div className="container mx-auto px-6 py-8 max-w-4xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-sky-500" /> Founder's Corner
            </h1>
            <p className="text-muted-foreground mt-1">A note from the founder and messages for the team.</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
          ) : (
            <>
              {/* Photo */}
              <div className="flex flex-col items-center mb-8">
                <div className="relative">
                  <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-sky-200 bg-muted flex items-center justify-center">
                    {content.photo_url ? (
                      <img src={content.photo_url} alt="Founder" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-muted-foreground text-sm">No photo</span>
                    )}
                  </div>
                  {isAdmin && (
                    <>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
                      />
                      <Button
                        size="sm"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={uploadingPhoto}
                        className="absolute -bottom-2 left-1/2 -translate-x-1/2 gap-1 bg-sky-500 hover:bg-sky-600"
                      >
                        {uploadingPhoto ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        {content.photo_url ? "Change" : "Upload"}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Vision note */}
              <Card className="p-6 mb-8 bg-gradient-to-br from-sky-50 to-white border-sky-200">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold">Vision from the Founder</h2>
                  {isAdmin && !editingVision && (
                    <Button size="sm" variant="ghost" onClick={() => { setVisionDraft(content.vision_note ?? ""); setEditingVision(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {editingVision ? (
                  <div className="space-y-2">
                    <Textarea rows={8} value={visionDraft} onChange={(e) => setVisionDraft(e.target.value)} placeholder="Share the vision..." />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveVision} disabled={savingVision} className="gap-1 bg-sky-500 hover:bg-sky-600">
                        {savingVision ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingVision(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {content.vision_note || <span className="text-muted-foreground italic">No vision note yet.</span>}
                  </p>
                )}
              </Card>

              {/* Messages */}
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Messages</h2>
                {isAdmin && (
                  <Button size="sm" onClick={() => setShowNewMsg((v) => !v)} className="gap-1 bg-sky-500 hover:bg-sky-600">
                    <Plus className="h-4 w-4" /> New Message
                  </Button>
                )}
              </div>

              {showNewMsg && isAdmin && (
                <Card className="p-4 mb-4 border-sky-300">
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="md:col-span-2">
                        <Label className="text-xs">Title</Label>
                        <Input value={newMsg.title} onChange={(e) => setNewMsg({ ...newMsg, title: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">Date</Label>
                        <Input type="date" value={newMsg.message_date} onChange={(e) => setNewMsg({ ...newMsg, message_date: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Message</Label>
                      <Textarea rows={4} value={newMsg.message} onChange={(e) => setNewMsg({ ...newMsg, message: e.target.value })} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={addMessage} className="bg-sky-500 hover:bg-sky-600">Add</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowNewMsg(false)}>Cancel</Button>
                    </div>
                  </div>
                </Card>
              )}

              <div className="space-y-3">
                {messages.length === 0 ? (
                  <Card className="p-6 text-center text-muted-foreground text-sm">No messages yet.</Card>
                ) : (
                  messages.map((m) => (
                    <Card key={m.id} className="p-4">
                      {editingMsgId === m.id ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <Input className="md:col-span-2" value={msgDraft.title} onChange={(e) => setMsgDraft({ ...msgDraft, title: e.target.value })} />
                            <Input type="date" value={msgDraft.message_date} onChange={(e) => setMsgDraft({ ...msgDraft, message_date: e.target.value })} />
                          </div>
                          <Textarea rows={4} value={msgDraft.message} onChange={(e) => setMsgDraft({ ...msgDraft, message: e.target.value })} />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveMessage(m.id)} className="bg-sky-500 hover:bg-sky-600">Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingMsgId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-muted-foreground tabular-nums">{m.message_date}</div>
                              <h3 className="font-semibold">{m.title}</h3>
                            </div>
                            {isAdmin && (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => { setEditingMsgId(m.id); setMsgDraft({ title: m.title, message: m.message, message_date: m.message_date }); }}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => deleteMessage(m.id)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <p className="text-sm whitespace-pre-wrap text-foreground/90">{m.message}</p>
                        </>
                      )}
                    </Card>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
