import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { 
  MessageSquare, 
  Plus, 
  Send, 
  Trash2, 
  CheckCircle, 
  Clock, 
  User,
  ChevronDown,
  ChevronRight,
  ListTodo
} from "lucide-react";

interface VersionNote {
  id: string;
  version_id: string;
  project_id: string;
  content: string;
  created_by: string;
  created_at: string;
  user?: {
    name: string;
    email: string;
  };
  tasks?: UserTask[];
}

interface UserTask {
  id: string;
  project_id: string;
  version_id: string | null;
  note_id: string | null;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  status: "pending" | "in_progress" | "completed";
  due_date: string | null;
  created_at: string;
  assignee?: {
    name: string;
    email: string;
  };
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface VersionNotesPanelProps {
  projectId: string;
  versionId: string | null;
}

const VersionNotesPanel = ({ projectId, versionId }: VersionNotesPanelProps) => {
  const [notes, setNotes] = useState<VersionNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  
  // Task creation state
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [taskNoteId, setTaskNoteId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (versionId) {
      fetchNotes();
      
      // Subscribe to changes
      const notesChannel = supabase
        .channel(`version_notes:${versionId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "version_notes",
            filter: `version_id=eq.${versionId}`,
          },
          () => fetchNotes()
        )
        .subscribe();

      const tasksChannel = supabase
        .channel(`user_tasks:${projectId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_tasks",
            filter: `project_id=eq.${projectId}`,
          },
          () => fetchNotes()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(notesChannel);
        supabase.removeChannel(tasksChannel);
      };
    }
  }, [versionId, projectId]);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email")
        .order("name");

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchNotes = async () => {
    if (!versionId) return;
    
    setLoading(true);
    try {
      // Fetch notes
      const { data: notesData, error: notesError } = await supabase
        .from("version_notes")
        .select("*")
        .eq("version_id", versionId)
        .order("created_at", { ascending: false });

      if (notesError) throw notesError;

      // Fetch user info for each note
      const notesWithUsers = await Promise.all(
        (notesData || []).map(async (note) => {
          const { data: userData } = await supabase
            .from("users")
            .select("name, email")
            .eq("id", note.created_by)
            .single();

          // Fetch tasks for this note
          const { data: tasksData } = await supabase
            .from("user_tasks")
            .select("*")
            .eq("note_id", note.id)
            .order("created_at", { ascending: true });

          // Fetch assignee info for each task
          const tasksWithAssignees = await Promise.all(
            (tasksData || []).map(async (task) => {
              const { data: assigneeData } = await supabase
                .from("users")
                .select("name, email")
                .eq("id", task.assigned_to)
                .single();
              return { ...task, assignee: assigneeData };
            })
          );

          return {
            ...note,
            user: userData,
            tasks: tasksWithAssignees,
          };
        })
      );

      setNotes(notesWithUsers);
    } catch (error) {
      console.error("Error fetching notes:", error);
      toast.error("Failed to load notes");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitNote = async () => {
    if (!newNote.trim() || !versionId || !currentUserId) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("version_notes")
        .insert({
          version_id: versionId,
          project_id: projectId,
          content: newNote.trim(),
          created_by: currentUserId,
        });

      if (error) throw error;

      toast.success("Note added successfully!");
      setNewNote("");
      fetchNotes();
    } catch (error: any) {
      console.error("Error adding note:", error);
      toast.error("Failed to add note");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const { error } = await supabase
        .from("version_notes")
        .delete()
        .eq("id", noteId);

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

    try {
      const { error } = await supabase
        .from("user_tasks")
        .insert({
          project_id: projectId,
          version_id: versionId,
          note_id: taskNoteId,
          title: taskTitle.trim(),
          description: taskDescription.trim() || null,
          assigned_to: taskAssignee,
          assigned_by: currentUserId,
          due_date: taskDueDate || null,
        });

      if (error) throw error;

      toast.success("Task created successfully!");
      setShowTaskDialog(false);
      resetTaskForm();
      fetchNotes();
    } catch (error: any) {
      console.error("Error creating task:", error);
      toast.error("Failed to create task");
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: "pending" | "in_progress" | "completed") => {
    try {
      const { error } = await supabase
        .from("user_tasks")
        .update({ status: newStatus })
        .eq("id", taskId);

      if (error) throw error;

      toast.success("Task updated");
      fetchNotes();
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Failed to update task");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("user_tasks")
        .delete()
        .eq("id", taskId);

      if (error) throw error;

      toast.success("Task deleted");
      fetchNotes();
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Failed to delete task");
    }
  };

  const resetTaskForm = () => {
    setTaskNoteId(null);
    setTaskTitle("");
    setTaskDescription("");
    setTaskAssignee("");
    setTaskDueDate("");
  };

  const toggleNoteExpanded = (noteId: string) => {
    const newExpanded = new Set(expandedNotes);
    if (newExpanded.has(noteId)) {
      newExpanded.delete(noteId);
    } else {
      newExpanded.add(noteId);
    }
    setExpandedNotes(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      case "in_progress":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      default:
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (!versionId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Select a version to see notes</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Notes & Tasks
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Leave notes and assign tasks
        </p>
      </div>

      {/* New Note Input */}
      <div className="p-4 border-b space-y-2">
        <Textarea
          placeholder="Add a note about this version..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          className="min-h-[80px] resize-none"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSubmitNote}
            disabled={!newNote.trim() || submitting}
            className="flex-1"
          >
            <Send className="h-3 w-3 mr-1" />
            Add Note
          </Button>
        </div>
      </div>

      {/* Notes List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-20 bg-muted rounded"></div>
              <div className="h-20 bg-muted rounded"></div>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No notes yet</p>
              <p className="text-xs">Be the first to leave a note</p>
            </div>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="border rounded-lg overflow-hidden">
                <div className="p-3 bg-muted/30">
                  <div className="flex items-start gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {note.user ? getInitials(note.user.name) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {note.user?.name || "Unknown"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(note.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{note.content}</p>
                    </div>
                    {note.created_by === currentUserId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => handleDeleteNote(note.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>

                  {/* Add Task Button */}
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setTaskNoteId(note.id);
                        setShowTaskDialog(true);
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Task
                    </Button>
                  </div>
                </div>

                {/* Tasks for this note */}
                {note.tasks && note.tasks.length > 0 && (
                  <Collapsible
                    open={expandedNotes.has(note.id)}
                    onOpenChange={() => toggleNoteExpanded(note.id)}
                  >
                    <CollapsibleTrigger asChild>
                      <div className="px-3 py-2 border-t bg-background cursor-pointer hover:bg-muted/30 flex items-center gap-2">
                        {expandedNotes.has(note.id) ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <ListTodo className="h-3 w-3" />
                        <span className="text-xs font-medium">
                          {note.tasks.length} task{note.tasks.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t divide-y">
                        {note.tasks.map((task) => (
                          <div key={task.id} className="p-3 bg-background">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">{task.title}</span>
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${getStatusColor(task.status)}`}
                                  >
                                    {task.status.replace("_", " ")}
                                  </Badge>
                                </div>
                                {task.description && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {task.description}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                  <User className="h-3 w-3" />
                                  <span>{task.assignee?.name || "Unknown"}</span>
                                  {task.due_date && (
                                    <>
                                      <Clock className="h-3 w-3 ml-2" />
                                      <span>{new Date(task.due_date).toLocaleDateString()}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Select
                                  value={task.status}
                                  onValueChange={(value: "pending" | "in_progress" | "completed") =>
                                    handleUpdateTaskStatus(task.id, value)
                                  }
                                >
                                  <SelectTrigger className="h-7 w-24 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                  </SelectContent>
                                </Select>
                                {(task.assigned_by === currentUserId || task.assigned_to === currentUserId) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => handleDeleteTask(task.id)}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Create Task Dialog */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>
              Assign a task to a team member
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Task Title *</Label>
              <Input
                id="task-title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Enter task title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Optional description"
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-assignee">Assign To *</Label>
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
              <Label htmlFor="task-due-date">Due Date</Label>
              <Input
                id="task-due-date"
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTask} disabled={!taskTitle.trim() || !taskAssignee}>
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VersionNotesPanel;
