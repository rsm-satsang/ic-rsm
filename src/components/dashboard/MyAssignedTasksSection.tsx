import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, ListTodo } from "lucide-react";

interface Row {
  id: string;
  project_id: string;
  project_title: string;
  task_title: string;
  description: string | null;
  created_at: string;
  assigner_name: string;
  status: string;
}

const MyAssignedTasksSection = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: tasks } = await supabase
          .from("user_tasks")
          .select("id, project_id, title, description, created_at, assigned_by, status")
          .eq("assigned_to", userId)
          .order("created_at", { ascending: false });

        if (!tasks || tasks.length === 0) {
          setRows([]);
          return;
        }

        const projectIds = Array.from(new Set(tasks.map((t) => t.project_id)));
        const userIds = Array.from(new Set(tasks.map((t) => t.assigned_by)));

        const [projectsRes, usersRes] = await Promise.all([
          supabase.from("projects").select("id, title").in("id", projectIds),
          supabase.from("users").select("id, name").in("id", userIds),
        ]);

        const projMap = new Map((projectsRes.data || []).map((p) => [p.id, p.title]));
        const userMap = new Map((usersRes.data || []).map((u) => [u.id, u.name]));

        setRows(
          tasks.map((t) => ({
            id: t.id,
            project_id: t.project_id,
            project_title: projMap.get(t.project_id) || "Unknown Project",
            task_title: t.title,
            description: t.description,
            created_at: t.created_at,
            assigner_name: userMap.get(t.assigned_by) || "Unknown",
            status: t.status,
          }))
        );
      } catch (e) {
        console.error("Failed to load assigned tasks", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

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
                  <TableHead>Project</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Assigned On</TableHead>
                  <TableHead>Assigned By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/workspace/${r.project_id}`)}
                  >
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
