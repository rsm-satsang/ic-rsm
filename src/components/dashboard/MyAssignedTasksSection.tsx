import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, ListTodo } from "lucide-react";

interface Row {
  key: string;
  source: "task" | "tracker" | "review" | "comment";
  project_id: string | null;
  project_title: string;
  task_title: string;
  description: string;
  created_at: string;
  assigner_name: string;
  link: string;
}

const PLAN_DONE = new Set(["plan_complete", "build_assigned", "build_in_progress", "operate_assigned", "publish_complete", "published"]);
const BUILD_DONE = new Set(["operate_assigned", "publish_complete", "published"]);
const OP_DONE = new Set(["publish_complete", "published"]);

const MyAssignedTasksSection = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [tasksRes, trackerRes, notifRes] = await Promise.all([
          supabase
            .from("user_tasks")
            .select("id, project_id, title, description, created_at, assigned_by, status")
            .eq("assigned_to", userId)
            .order("created_at", { ascending: false }),
          supabase
            .from("tracker_entries")
            .select("id, project_id, title, draft_title, week_start_date, status, plan_assignee_id, build_assignee_id, operate_assignee_id, plan_due_date, build_due_date, operate_due_date, sub_channel")
            .or(`plan_assignee_id.eq.${userId},build_assignee_id.eq.${userId},operate_assignee_id.eq.${userId}`)
            .order("week_start_date", { ascending: true }),
          supabase
            .from("notifications")
            .select("id, type, project_id, message, link, created_at, actor_id, read_at")
            .eq("user_id", userId)
            .in("type", ["review_request", "draft_comment"])
            .is("read_at", null)
            .order("created_at", { ascending: false }),
        ]);

        const tasks = tasksRes.data || [];
        const tracker = trackerRes.data || [];
        const notifs = notifRes.data || [];

        const userIds = new Set<string>();
        const projectIds = new Set<string>();
        tasks.forEach((t) => { userIds.add(t.assigned_by); projectIds.add(t.project_id); });
        tracker.forEach((t) => { if (t.project_id) projectIds.add(t.project_id); });
        notifs.forEach((n) => { if (n.actor_id) userIds.add(n.actor_id); if (n.project_id) projectIds.add(n.project_id); });

        const [projectsRes, usersRes] = await Promise.all([
          projectIds.size
            ? supabase.from("projects").select("id, title").in("id", Array.from(projectIds))
            : Promise.resolve({ data: [] as any[] }),
          userIds.size
            ? supabase.from("users").select("id, name").in("id", Array.from(userIds))
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const projMap = new Map((projectsRes.data || []).map((p: any) => [p.id, p.title]));
        const userMap = new Map((usersRes.data || []).map((u: any) => [u.id, u.name]));

        const out: Row[] = [];

        for (const t of tasks) {
          out.push({
            key: `task-${t.id}`,
            source: "task",
            project_id: t.project_id,
            project_title: projMap.get(t.project_id) || "Unknown Project",
            task_title: t.title,
            description: t.description || "—",
            created_at: t.created_at,
            assigner_name: userMap.get(t.assigned_by) || "Unknown",
            link: `/workspace/${t.project_id}`,
          });
        }

        for (const e of tracker) {
          const phases: { phase: string; due: string | null; emoji: string }[] = [];
          if (e.plan_assignee_id === userId && !PLAN_DONE.has(e.status as string)) {
            phases.push({ phase: "Plan", due: e.plan_due_date, emoji: "📝" });
          }
          if (e.build_assignee_id === userId && !BUILD_DONE.has(e.status as string) && PLAN_DONE.has(e.status as string)) {
            phases.push({ phase: "Build", due: e.build_due_date, emoji: "🛠️" });
          }
          if (e.operate_assignee_id === userId && !OP_DONE.has(e.status as string) && BUILD_DONE.has(e.status as string)) {
            phases.push({ phase: "Operate / Publish", due: e.operate_due_date, emoji: "📣" });
          }
          for (const p of phases) {
            const label = e.title || e.draft_title || `${e.sub_channel} · Week of ${e.week_start_date}`;
            out.push({
              key: `tracker-${e.id}-${p.phase}`,
              source: "tracker",
              project_id: e.project_id,
              project_title: e.project_id ? (projMap.get(e.project_id) || label) : label,
              task_title: `${p.emoji} ${p.phase} — ${label}`,
              description: p.due ? `Due ${p.due}` : `Week of ${e.week_start_date}`,
              created_at: e.week_start_date,
              assigner_name: "Tracker",
              link: e.project_id ? `/workspace/${e.project_id}` : `/tracker`,
            });
          }
        }

        for (const n of notifs) {
          const isReview = n.type === "review_request";
          out.push({
            key: `notif-${n.id}`,
            source: isReview ? "review" : "comment",
            project_id: n.project_id,
            project_title: n.project_id ? (projMap.get(n.project_id) || "Project") : "Project",
            task_title: isReview ? "📖 Review newsletter draft" : "💬 New comment on your draft",
            description: n.message || "",
            created_at: n.created_at,
            assigner_name: n.actor_id ? (userMap.get(n.actor_id) || "Teammate") : "System",
            link: n.link || (n.project_id ? `/workspace/${n.project_id}` : "/dashboard"),
          });
        }

        out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setRows(out);
      } catch (e) {
        console.error("Failed to load assigned tasks", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const badgeFor = (s: Row["source"]) => {
    const map: Record<string, string> = {
      task: "Task",
      tracker: "Tracker",
      review: "Review",
      comment: "Comment",
    };
    return map[s];
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-6 border rounded-lg bg-card shadow-sm">
      <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors rounded-lg">
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <ListTodo className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">My Assigned Tasks</h2>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-4 pt-0">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No tasks assigned to you.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>From</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.key}
                    className="cursor-pointer"
                    onClick={() => navigate(r.link)}
                  >
                    <TableCell><Badge variant="outline">{badgeFor(r.source)}</Badge></TableCell>
                    <TableCell className="font-medium">{r.project_title}</TableCell>
                    <TableCell>{r.task_title}</TableCell>
                    <TableCell className="max-w-md text-sm text-muted-foreground">
                      {r.description || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(r.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">{r.assigner_name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default MyAssignedTasksSection;
