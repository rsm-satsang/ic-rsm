import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface AssignDialogProps {
  projectId: string;
  versionId: string | null;
  triggerVariant?: "default" | "outline" | "secondary";
  triggerLabel?: string;
}

const AssignDialog = ({
  projectId,
  versionId,
  triggerVariant = "outline",
  triggerLabel = "Assign",
}: AssignDialogProps) => {
  const [open, setOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
      const { data } = await supabase
        .from("users")
        .select("id, name, email")
        .order("name");
      setUsers(data || []);
    })();
  }, [open]);

  const handleSubmit = async () => {
    if (!description.trim() || !assignee || !currentUserId) return;
    setSubmitting(true);
    try {
      // Derive a short title from the first line of the description so the
      // existing schema (which requires a title) stays satisfied.
      const firstLine = description.trim().split(/\r?\n/)[0].slice(0, 120);
      const title = firstLine || "Task";

      const { error } = await supabase.from("user_tasks").insert({
        project_id: projectId,
        version_id: versionId,
        note_id: null,
        title,
        description: description.trim(),
        assigned_to: assignee,
        assigned_by: currentUserId,
        due_date: null,
      });
      if (error) throw error;

      if (assignee !== currentUserId) {
        await supabase.from("notifications").insert({
          user_id: assignee,
          actor_id: currentUserId,
          type: "assignment",
          entity_type: "task",
          project_id: projectId,
          message: `You were assigned a task: ${title}`,
          link: `/workspace/${projectId}`,
        });
      }

      const { data: project } = await supabase
        .from("projects")
        .select("title")
        .eq("id", projectId)
        .maybeSingle();
      supabase.functions
        .invoke("notify-assignment", {
          body: {
            assigneeId: assignee,
            assignedById: currentUserId,
            taskTitle: title,
            taskDescription: description.trim(),
            projectId,
            projectTitle: project?.title || null,
            dueDate: null,
          },
        })
        .catch((e) => console.error("notify-assignment failed", e));

      toast.success("Task assigned — emails sent");
      setDescription("");
      setAssignee("");
      setOpen(false);
    } catch (error) {
      console.error("Error creating task:", error);
      toast.error("Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className="gap-2">
          <UserPlus className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Assign Task
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Assign To *</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assign-dlg-desc">Description *</Label>
            <Textarea
              id="assign-dlg-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task"
              className="resize-none min-h-[100px]"
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || !assignee || submitting}
            className="w-full"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            {submitting ? "Assigning..." : "Assign Task"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssignDialog;

