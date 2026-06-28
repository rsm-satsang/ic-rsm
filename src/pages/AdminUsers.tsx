import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import GlobalNav from "@/components/GlobalNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck, ShieldX, Save } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_notes: string | null;
  created_at: string;
  content_roles: string[] | null;
}

interface DraftEdits {
  name: string;
  isAdmin: boolean;
  roles: Set<string>;
}

const STATUS_BADGE: Record<string, string> = {
  approved: "bg-green-100 text-green-800 border-green-200",
  pending_approval: "bg-yellow-100 text-yellow-800 border-yellow-200",
  pending_email: "bg-blue-100 text-blue-800 border-blue-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  suspended: "bg-gray-200 text-gray-700 border-gray-300",
};

const STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  pending_approval: "Pending Approval",
  pending_email: "Pending Email Verification",
  rejected: "Rejected",
  suspended: "Suspended",
};

const toDraft = (u: UserRow): DraftEdits => ({
  name: u.name || "",
  isAdmin: u.role === "admin",
  roles: new Set(u.content_roles ?? []),
});

const draftsEqual = (a: DraftEdits, b: DraftEdits) => {
  if (a.name !== b.name) return false;
  if (a.isAdmin !== b.isAdmin) return false;
  if (a.roles.size !== b.roles.size) return false;
  for (const r of a.roles) if (!b.roles.has(r)) return false;
  return true;
};

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftEdits>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectNotes, setRejectNotes] = useState("");
  const [rejectTarget, setRejectTarget] = useState<UserRow | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }
      const { data } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
      const role = (data as any)?.role;
      if (role !== "admin") {
        toast.error("Admin access required");
        navigate("/dashboard");
        return;
      }
      setMe({ id: user.id, role });
      await load();
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, approval_status, approved_by, approved_at, rejection_notes, created_at, content_roles")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else {
      const list = (data || []) as UserRow[];
      setUsers(list);
      const d: Record<string, DraftEdits> = {};
      list.forEach((u) => { d[u.id] = toDraft(u); });
      setDrafts(d);
    }
    setLoading(false);
  };

  const updateDraft = (id: string, patch: Partial<DraftEdits>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const toggleRole = (id: string, role: string, checked: boolean) => {
    setDrafts((prev) => {
      const next = new Set(prev[id]?.roles ?? []);
      if (checked) next.add(role); else next.delete(role);
      return { ...prev, [id]: { ...prev[id], roles: next } };
    });
  };

  const saveRow = async (u: UserRow) => {
    const draft = drafts[u.id];
    if (!draft) return;
    const trimmedName = draft.name.trim();
    if (!trimmedName) { toast.error("Name cannot be empty"); return; }
    setSavingId(u.id);
    try {
      const { error } = await supabase.from("users").update({
        name: trimmedName,
        role: (draft.isAdmin ? "admin" : "user") as any,
        content_roles: Array.from(draft.roles),
      } as any).eq("id", u.id);
      if (error) throw error;
      setUsers((prev) => prev.map((x) => x.id === u.id ? {
        ...x,
        name: trimmedName,
        role: draft.isAdmin ? "admin" : "user",
        content_roles: Array.from(draft.roles),
      } : x));
      toast.success("Saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSavingId(null);
    }
  };

  const setStatus = async (u: UserRow, status: string, notes?: string) => {
    if (!me) return;
    const { error } = await supabase
      .from("users")
      .update({
        approval_status: status as any,
        approved_by: me.id,
        approved_at: new Date().toISOString(),
        rejection_notes: notes ?? null,
      })
      .eq("id", u.id);
    if (error) return toast.error(error.message);
    await supabase.from("user_audit_log").insert({
      actor_id: me.id,
      target_user_id: u.id,
      action: status,
      notes: notes ?? null,
    });
    toast.success(`User ${STATUS_LABEL[status]}`);
    await load();
  };

  const pending = users.filter((u) => u.approval_status === "pending_approval");

  const renderRows = (list: UserRow[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name (Login)</TableHead>
          <TableHead>Called By</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map((u) => {
          const draft = drafts[u.id] ?? toDraft(u);
          const dirty = !draftsEqual(draft, toDraft(u));
          return (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.name}</TableCell>
              <TableCell>
                <Input
                  value={draft.name}
                  onChange={(e) => updateDraft(u.id, { name: e.target.value })}
                  className="h-8 min-w-[160px]"
                  placeholder={u.name}
                />
              </TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                <Badge variant="outline" className={STATUS_BADGE[u.approval_status] || ""}>
                  {STATUS_LABEL[u.approval_status] || u.approval_status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={draft.isAdmin} onCheckedChange={(v) => updateDraft(u.id, { isAdmin: !!v })} />
                    Admin
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={draft.roles.has("planner")} onCheckedChange={(v) => toggleRole(u.id, "planner", !!v)} />
                    Can Plan
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={draft.roles.has("builder")} onCheckedChange={(v) => toggleRole(u.id, "builder", !!v)} />
                    Can Build
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={draft.roles.has("operator")} onCheckedChange={(v) => toggleRole(u.id, "operator", !!v)} />
                    Can Operate
                  </label>
                </div>
              </TableCell>
              <TableCell className="text-right space-x-2 whitespace-nowrap">
                <Button
                  size="sm"
                  variant={dirty ? "default" : "outline"}
                  disabled={!dirty || savingId === u.id}
                  onClick={() => saveRow(u)}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {savingId === u.id ? "Saving..." : "Save"}
                </Button>
                {u.approval_status !== "approved" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus(u, "approved")}>
                    <ShieldCheck className="h-4 w-4 mr-1" /> Approve
                  </Button>
                )}
                {u.approval_status !== "rejected" && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" onClick={() => { setRejectTarget(u); setRejectNotes(""); }}>
                        <ShieldX className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Reject {u.name}?</DialogTitle></DialogHeader>
                      <Textarea
                        placeholder="Reason (optional)"
                        value={rejectNotes}
                        onChange={(e) => setRejectNotes(e.target.value)}
                      />
                      <Button
                        variant="destructive"
                        onClick={() => rejectTarget && setStatus(rejectTarget, "rejected", rejectNotes)}
                      >
                        Confirm Reject
                      </Button>
                    </DialogContent>
                  </Dialog>
                )}
                {u.approval_status === "approved" && (
                  <Button size="sm" variant="ghost" onClick={() => setStatus(u, "suspended")}>
                    Suspend
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
        {list.length === 0 && (
          <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users</TableCell></TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <div className="pl-14">
        <div className="container mx-auto px-6 py-8 max-w-6xl">
          <h1 className="text-3xl font-bold mb-2">User Management</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Edit the "Called By" name and role checkboxes, then click Save. The "Called By" name is used across the application.
          </p>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Tabs defaultValue="pending">
              <TabsList>
                <TabsTrigger value="pending">
                  Pending Approvals {pending.length > 0 && <Badge className="ml-2">{pending.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="all">All Users</TabsTrigger>
              </TabsList>
              <TabsContent value="pending" className="mt-4">
                <Card>{renderRows(pending)}</Card>
              </TabsContent>
              <TabsContent value="all" className="mt-4">
                <Card>{renderRows(users)}</Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
