import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  projectId: string;
  versionId: string | null;
  requesterId: string;
  projectTitle: string;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export default function NotifyReviewersDialog({ projectId, versionId, requesterId, projectTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, role, approval_status")
        .eq("approval_status", "approved")
        .order("role", { ascending: true })
        .order("name", { ascending: true });
      if (error) {
        console.error(error);
        toast.error("Failed to load users");
      } else {
        const rows = (data || []) as UserRow[];
        setUsers(rows);
        // Default-check admins and builders (role='user')
        const def: Record<string, boolean> = {};
        rows.forEach((u) => {
          if (u.role === "admin" || u.role === "user") def[u.id] = true;
        });
        setSelected(def);
      }
      setLoading(false);
    })();
  }, [open]);

  const toggle = (id: string) =>
    setSelected((s) => ({ ...s, [id]: !s[id] }));

  const handleSend = async () => {
    const emails = users.filter((u) => selected[u.id]).map((u) => u.email);
    if (emails.length === 0) {
      toast.error("Select at least one reviewer");
      return;
    }
    setSending(true);
    try {
      let versionLabel = "Latest";
      if (versionId) {
        const { data: v } = await supabase
          .from("versions").select("title, version_number").eq("id", versionId).maybeSingle();
        if (v) versionLabel = `${v.title || "Untitled"} (v${v.version_number ?? "?"})`;
      }
      const { data, error } = await supabase.functions.invoke("notify-reviewers", {
        body: { projectId, versionId, requesterId, recipientEmails: emails },
      });
      if (error) throw error;

      const { data: userData } = await supabase.from("users").select("name").eq("id", requesterId).maybeSingle();
      await supabase.from("timeline").insert({
        project_id: projectId,
        event_type: "review_requested" as any,
        event_details: {
          version: versionLabel,
          recipients: (data as any)?.sent ?? emails.length,
          recipientEmails: emails,
          project_title: projectTitle,
        },
        user_id: requesterId,
        user_name: userData?.name || "Unknown User",
      } as any);

      toast.success(`Notified ${(data as any)?.sent ?? emails.length} reviewer(s)`);
      setOpen(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to notify reviewers");
    } finally {
      setSending(false);
    }
  };

  const admins = users.filter((u) => u.role === "admin");
  const builders = users.filter((u) => u.role === "user");
  const others = users.filter((u) => u.role !== "admin" && u.role !== "user");

  const renderGroup = (label: string, list: UserRow[]) => (
    list.length > 0 && (
      <div className="space-y-1">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">{label}</div>
        {list.map((u) => (
          <label key={u.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
            <Checkbox checked={!!selected[u.id]} onCheckedChange={() => toggle(u.id)} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{u.name || u.email}</div>
              <div className="text-xs text-muted-foreground truncate">{u.email}</div>
            </div>
            <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
          </label>
        ))}
      </div>
    )
  );

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Send className="h-4 w-4" />
          Notify Reviewers
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Notify Reviewers</DialogTitle>
          <DialogDescription>
            Admins and Builders are selected by default. Adjust as needed.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto space-y-3 -mx-1 px-1">
          {loading ? (
            <div className="text-sm text-muted-foreground p-4 text-center">Loading users…</div>
          ) : (
            <>
              {renderGroup("Admins", admins)}
              {renderGroup("Builders", builders)}
              {renderGroup("Others", others)}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || selectedCount === 0}>
            {sending ? "Sending…" : `Send to ${selectedCount}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
