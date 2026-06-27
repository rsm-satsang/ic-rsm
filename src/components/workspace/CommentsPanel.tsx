import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageSquare, Send, Trash2, CheckCircle2, Reply, Mail } from "lucide-react";

interface User { id: string; name: string; email: string; }

interface CommentRow {
  id: string;
  project_id: string;
  version_id: string | null;
  user_id: string;
  text: string;
  resolved: boolean | null;
  resolved_at: string | null;
  parent_id: string | null;
  mentions: string[];
  entity_type: string;
  created_at: string;
}

interface Props {
  projectId: string;
  versionId: string | null;
}

const parseMentions = (text: string, users: User[]): string[] => {
  const handles = (text.match(/@([\w.-]+)/g) || []).map((m) => m.slice(1).toLowerCase());
  const ids: string[] = [];
  for (const h of handles) {
    const u = users.find(
      (x) =>
        x.name.toLowerCase().replace(/\s+/g, "") === h ||
        x.email.toLowerCase().split("@")[0] === h
    );
    if (u) ids.push(u.id);
  }
  return Array.from(new Set(ids));
};

export default function CommentsPanel({ projectId, versionId }: Props) {
  const [me, setMe] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    const caret = e.target.selectionStart ?? val.length;
    const upto = val.slice(0, caret);
    const m = upto.match(/@([\w.-]*)$/);
    setMentionQuery(m ? m[1].toLowerCase() : null);
  };

  const insertMention = (u: User) => {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w.-]*)$/, "");
    const after = text.slice(caret);
    const handle = (u.name || u.email.split("@")[0]).replace(/\s+/g, "");
    const next = `${before}@${handle} ${after}`;
    setText(next);
    setMentionQuery(null);
    setTimeout(() => {
      el.focus();
      const pos = (before + "@" + handle + " ").length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const mentionSuggestions = mentionQuery === null
    ? []
    : users
        .filter((u) => {
          const handle = (u.name || "").toLowerCase().replace(/\s+/g, "");
          const emailHandle = u.email.toLowerCase().split("@")[0];
          return mentionQuery === "" ||
            handle.includes(mentionQuery) ||
            emailHandle.includes(mentionQuery) ||
            (u.name || "").toLowerCase().includes(mentionQuery);
        })
        .slice(0, 6);

  const load = async () => {
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    setComments((data || []) as any);
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setMe(user.id);
      const { data: us } = await supabase.from("users").select("id, name, email").order("name");
      setUsers((us || []) as User[]);
      await load();
    })();
  }, [projectId]);

  const submit = async () => {
    if (!text.trim() || !me) return;
    setSubmitting(true);
    try {
      const mentions = parseMentions(text, users);
      const { data, error } = await supabase
        .from("comments")
        .insert({
          project_id: projectId,
          version_id: versionId,
          user_id: me,
          text: text.trim(),
          parent_id: replyTo,
          mentions,
          entity_type: "version",
        } as any)
        .select()
        .single();
      if (error) throw error;

      // notifications for mentions + reply target + draft author + admins/builders
      const recipients = new Set<string>(mentions);
      if (replyTo) {
        const parent = comments.find((c) => c.id === replyTo);
        if (parent && parent.user_id !== me) recipients.add(parent.user_id);
      }

      // Draft author (version creator) — task to address comments on their draft
      if (versionId) {
        const { data: ver } = await supabase
          .from("versions")
          .select("created_by")
          .eq("id", versionId)
          .maybeSingle();
        if (ver?.created_by && ver.created_by !== me) recipients.add(ver.created_by);
      }

      // All approved admins + builders (reviewers) get notified of new comments
      const { data: reviewers } = await supabase
        .from("users")
        .select("id")
        .in("role", ["admin", "user"])
        .eq("approval_status", "approved");
      (reviewers || []).forEach((r: any) => recipients.add(r.id));

      recipients.delete(me);
      if (recipients.size) {
        await supabase.from("notifications").insert(
          Array.from(recipients).map((uid) => ({
            user_id: uid,
            actor_id: me,
            type: replyTo ? "reply" : "draft_comment",
            entity_type: "comment",
            entity_id: data.id,
            project_id: projectId,
            message: text.trim().slice(0, 140),
            link: `/workspace/${projectId}`,
          }))
        );
      }

      // timeline entry
      const { data: meRow } = await supabase.from("users").select("name").eq("id", me).single();
      await supabase.from("timeline").insert({
        project_id: projectId,
        event_type: "comment_added",
        event_details: {
          text: text.trim(),
          preview: text.trim().slice(0, 140),
          is_reply: !!replyTo,
          parent_id: replyTo,
        },
        user_id: me,
        user_name: (meRow as any)?.name || "User",
      } as any);

      // Email notification to admins + builders (reviewers) — await so errors surface
      try {
        const { data: emailRes, error: emailErr } = await supabase.functions.invoke("notify-comment", {
          body: { projectId, commentId: data.id, commentText: text.trim(), authorId: me },
        });
        if (emailErr) {
          console.error("notify-comment failed", emailErr);
          toast.error("Comment saved, but email notification failed");
        } else {
          console.log("notify-comment result", emailRes);
        }
      } catch (err) {
        console.error("notify-comment exception", err);
      }

      setText("");
      setReplyTo(null);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to add comment");
    } finally {
      setSubmitting(false);
    }
  };

  const resolve = async (id: string) => {
    await supabase
      .from("comments")
      .update({ resolved: true, resolved_at: new Date().toISOString() } as any)
      .eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("comments").delete().eq("id", id);
    load();
  };

  const userOf = (uid: string) => users.find((u) => u.id === uid);
  const initials = (n: string) => n.split(" ").map((s) => s[0]).join("").toUpperCase().slice(0, 2);

  const roots = comments.filter((c) => !c.parent_id);
  const repliesFor = (id: string) => comments.filter((c) => c.parent_id === id);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center gap-2 font-semibold">
        <MessageSquare className="h-4 w-4" />
        Comments
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {roots.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No comments yet</p>
        ) : (
          roots.map((c) => {
            const u = userOf(c.user_id);
            return (
              <div key={c.id} className={`border rounded-lg p-3 ${c.resolved ? "bg-muted/40 opacity-60" : "bg-card"}`}>
                <div className="flex items-start gap-2">
                  <Avatar className="h-6 w-6"><AvatarFallback className="text-xs">{initials(u?.name || "?")}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium whitespace-nowrap">{u?.name || "User"}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(c.created_at).toLocaleString()}</span>
                      {c.resolved && <Badge variant="outline" className="text-xs">Resolved</Badge>}
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words mt-1">{c.text}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setReplyTo(c.id)}>
                        <Reply className="h-3 w-3 mr-1" /> Reply
                      </Button>
                      {!c.resolved && (
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => resolve(c.id)}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve
                        </Button>
                      )}
                      {c.user_id === me && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => remove(c.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    {repliesFor(c.id).map((r) => {
                      const ru = userOf(r.user_id);
                      return (
                        <div key={r.id} className="mt-2 ml-4 border-l-2 pl-3 py-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <Avatar className="h-5 w-5 self-center"><AvatarFallback className="text-[10px]">{initials(ru?.name || "?")}</AvatarFallback></Avatar>
                            <span className="text-xs font-medium whitespace-nowrap">{ru?.name}</span>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</span>
                            {r.user_id === me && (
                              <button onClick={() => remove(r.id)} className="text-destructive ml-auto">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          <p className="text-xs whitespace-pre-wrap break-words mt-1">{r.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t p-3 space-y-2 relative">
        {replyTo && (
          <div className="text-xs text-muted-foreground flex items-center justify-between">
            Replying to comment <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>Cancel</Button>
          </div>
        )}
        {mentionSuggestions.length > 0 && (
          <div className="absolute bottom-[110px] left-3 right-3 bg-popover border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
            {mentionSuggestions.map((u) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left text-sm"
              >
                <Avatar className="h-5 w-5"><AvatarFallback className="text-[10px]">{initials(u.name || "?")}</AvatarFallback></Avatar>
                <span className="font-medium">{u.name}</span>
                <span className="text-xs text-muted-foreground truncate">{u.email}</span>
              </button>
            ))}
          </div>
        )}
        <Textarea
          ref={textareaRef}
          placeholder="Write a comment… use @name to mention"
          value={text}
          onChange={handleTextChange}
          className="min-h-[60px] resize-none"
        />
        <Button size="sm" className="w-full" onClick={submit} disabled={!text.trim() || submitting}>
          <Send className="h-3 w-3 mr-1" />
          {submitting ? "Sending…" : replyTo ? "Reply" : "Comment"}
        </Button>
      </div>
    </div>
  );
}
