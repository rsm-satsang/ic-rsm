import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Settings2,
  UserPlus,
  MessageSquare,
  Send,
  Trash2,
  Clock,
  User,
  CheckCircle,
} from "lucide-react";

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface ManagePanelProps {
  projectId: string;
  versionId: string | null;
  currentStatus: "draft" | "in_progress" | "review" | "approved" | "published";
  onStatusChange: (status: "draft" | "in_progress" | "review" | "approved" | "published") => void;
}

const ManagePanel = ({ projectId, versionId, currentStatus, onStatusChange }: ManagePanelProps) => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);

  // Assign form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [submittingTask, setSubmittingTask] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(true);

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (versionId) {
      fetchNotes();
    }
  }, [versionId]);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from("users").select("id, name, email").order("name");
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchNotes = async () => {
    if (!versionId) return;
    setLoadingNotes(true);
    try {
      const { data, error } = await supabase
        .from("version_notes")
        .select("*")
        .eq("version_id", versionId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const notesWithUsers = await Promise.all(
        (data || []).map(async (note) => {
          const { data: userData } = await supabase.from("users").select("name, email").eq("id", note.created_by).single();
          return { ...note, user: userData };
        })
      );
      setNotes(notesWithUsers);
    } catch (error) {
      console.error("Error fetching notes:", error);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleSubmitNote = async () => {
    if (!newNote.trim() || !versionId || !currentUserId) return;
    setSubmittingNote(true);
    try {
      const { error } = await supabase.from("version_notes").insert({
        version_id: versionId,
        project_id: projectId,
        content: newNote.trim(),
        created_by: currentUserId,
      });
      if (error) throw error;
      toast.success("Note added!");
      setNewNote("");
      fetchNotes();
    } catch (error) {
      console.error("Error adding note:", error);
      toast.error("Failed to add note");
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const { error } = await supabase.from("version_notes").delete().eq("id", noteId);
      if (error) throw error;
      toast.success("Note deleted");
      fetchNotes();
    } catch (error) {
      console.error("Error deleting note:", error);
      toast.error("Failed to delete note");
    }
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !taskAssignee || !currentUserId) return;
    setSubmittingTask(true);
    try {
      const { error } = await supabase.from("user_tasks").insert({
        project_id: projectId,
        version_id: versionId,
        note_id: null,
        title: taskTitle.trim(),
        description: taskDescription.trim() || null,
        assigned_to: taskAssignee,
        assigned_by: currentUserId,
        due_date: taskDueDate || null,
      });
      if (error) throw error;
      toast.success("Task assigned!");
      setTaskTitle("");
      setTaskDescription("");
      setTaskAssignee("");
      setTaskDueDate("");
    } catch (error) {
      console.error("Error creating task:", error);
      toast.error("Failed to create task");
    } finally {
      setSubmittingTask(false);
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "draft": return "In Progress";
      case "in_progress": return "In Progress";
      case "review": return "Under Review";
      case "approved": return "Approved";
      case "published": return "Published";
      default: return status;
    }
  };

  return (
    <div className="flex flex-col max-h-[550px]">
      <div className="p-3 border-b">
        <h3 className="font-semibold flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Manage
        </h3>
      </div>

      <Tabs defaultValue="status" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full grid grid-cols-3 h-auto p-1 mx-3 mt-2 bg-muted rounded-lg" style={{ width: "calc(100% - 1.5rem)" }}>
          <TabsTrigger value="status" className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm py-1.5 text-xs gap-1">
            <CheckCircle className="h-3 w-3" />
            Status
          </TabsTrigger>
          <TabsTrigger value="assign" className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm py-1.5 text-xs gap-1">
            <UserPlus className="h-3 w-3" />
            Assign
          </TabsTrigger>
          <TabsTrigger value="notes" className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm py-1.5 text-xs gap-1">
            <MessageSquare className="h-3 w-3" />
            Notes
          </TabsTrigger>
        </TabsList>

        {/* Status Tab */}
        <TabsContent value="status" className="flex-1 m-0 p-0 overflow-auto">
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Project Status</Label>
              <Select value={currentStatus} onValueChange={onStatusChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="review">Under Review</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Current: <Badge variant="outline" className="ml-1">{getStatusLabel(currentStatus)}</Badge>
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Assign Tab */}
        <TabsContent value="assign" className="flex-1 m-0 p-0 overflow-auto">
          <ScrollArea className="h-full max-h-[420px]">
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="assign-title">Task Title *</Label>
                <Input
                  id="assign-title"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Enter task title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assign-desc">Description</Label>
                <Textarea
                  id="assign-desc"
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Optional description"
                  className="resize-none min-h-[60px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Assign To *</Label>
                <Select value={taskAssignee} onValueChange={setTaskAssignee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                />
              </div>
              <Button
                onClick={handleCreateTask}
                disabled={!taskTitle.trim() || !taskAssignee || submittingTask}
                className="w-full"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                {submittingTask ? "Assigning..." : "Assign Task"}
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="flex-1 m-0 p-0 overflow-hidden flex flex-col">
          <div className="p-3 border-b space-y-2">
            <Textarea
              placeholder="Add a note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="min-h-[60px] resize-none"
            />
            <Button
              size="sm"
              onClick={handleSubmitNote}
              disabled={!newNote.trim() || submittingNote}
              className="w-full"
            >
              <Send className="h-3 w-3 mr-1" />
              Add Note
            </Button>
          </div>
          <ScrollArea className="flex-1 max-h-[300px]">
            <div className="p-3 space-y-3">
              {loadingNotes ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-16 bg-muted rounded" />
                  <div className="h-16 bg-muted rounded" />
                </div>
              ) : !versionId ? (
                <p className="text-sm text-muted-foreground text-center py-4">Select a version to see notes</p>
              ) : notes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="border rounded-lg p-3 bg-muted/30">
                    <div className="flex items-start gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {note.user ? getInitials(note.user.name) : "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{note.user?.name || "Unknown"}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(note.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm mt-1 whitespace-pre-wrap">{note.content}</p>
                      </div>
                      {note.created_by === currentUserId && (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDeleteNote(note.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ManagePanel;
