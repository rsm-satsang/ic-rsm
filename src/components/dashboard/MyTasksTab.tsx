import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ListTodo,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  MessageSquare,
  User,
  Calendar,
  ExternalLink,
} from "lucide-react";

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
  project?: {
    title: string;
  };
  assigner?: {
    name: string;
  };
  note?: {
    content: string;
  };
}

interface ProjectNote {
  id: string;
  project_id: string;
  version_id: string;
  content: string;
  created_at: string;
  user?: {
    name: string;
  };
  project?: {
    title: string;
  };
  version?: {
    title: string;
    version_number: number;
  };
}

interface MyTasksTabProps {
  userId: string;
}

const MyTasksTab = ({ userId }: MyTasksTabProps) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<UserTask[]>([]);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("tasks");
  const [taskFilter, setTaskFilter] = useState<"all" | "pending" | "in_progress" | "completed">("all");

  useEffect(() => {
    fetchTasks();
    fetchNotes();

    // Subscribe to task changes
    const tasksChannel = supabase
      .channel("my_tasks")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_tasks",
          filter: `assigned_to=eq.${userId}`,
        },
        () => fetchTasks()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
    };
  }, [userId]);

  const fetchTasks = async () => {
    try {
      const { data: tasksData, error: tasksError } = await supabase
        .from("user_tasks")
        .select("*")
        .eq("assigned_to", userId)
        .order("created_at", { ascending: false });

      if (tasksError) throw tasksError;

      // Fetch related data for each task
      const tasksWithDetails = await Promise.all(
        (tasksData || []).map(async (task) => {
          const [projectRes, assignerRes, noteRes] = await Promise.all([
            supabase.from("projects").select("title").eq("id", task.project_id).single(),
            supabase.from("users").select("name").eq("id", task.assigned_by).single(),
            task.note_id
              ? supabase.from("version_notes").select("content").eq("id", task.note_id).single()
              : Promise.resolve({ data: null }),
          ]);

          return {
            ...task,
            project: projectRes.data,
            assigner: assignerRes.data,
            note: noteRes.data,
          };
        })
      );

      setTasks(tasksWithDetails);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  const fetchNotes = async () => {
    try {
      // Get projects where user has access
      const { data: ownedProjects } = await supabase
        .from("projects")
        .select("id")
        .eq("owner_id", userId);

      const { data: collabProjects } = await supabase
        .from("collaborators")
        .select("project_id")
        .eq("user_id", userId);

      const projectIds = [
        ...(ownedProjects?.map((p) => p.id) || []),
        ...(collabProjects?.map((c) => c.project_id) || []),
      ];

      if (projectIds.length === 0) {
        setNotes([]);
        return;
      }

      // Fetch notes for accessible projects
      const { data: notesData, error: notesError } = await supabase
        .from("version_notes")
        .select("*")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
        .limit(50);

      if (notesError) throw notesError;

      // Fetch related data for each note
      const notesWithDetails = await Promise.all(
        (notesData || []).map(async (note) => {
          const [userRes, projectRes, versionRes] = await Promise.all([
            supabase.from("users").select("name").eq("id", note.created_by).single(),
            supabase.from("projects").select("title").eq("id", note.project_id).single(),
            supabase
              .from("versions")
              .select("title, version_number")
              .eq("id", note.version_id)
              .single(),
          ]);

          return {
            ...note,
            user: userRes.data,
            project: projectRes.data,
            version: versionRes.data,
          };
        })
      );

      setNotes(notesWithDetails);
    } catch (error) {
      console.error("Error fetching notes:", error);
    }
  };

  const handleUpdateTaskStatus = async (
    taskId: string,
    newStatus: "pending" | "in_progress" | "completed"
  ) => {
    try {
      const { error } = await supabase
        .from("user_tasks")
        .update({ status: newStatus })
        .eq("id", taskId);

      if (error) throw error;

      toast.success("Task updated");
      fetchTasks();
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Failed to update task");
    }
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-blue-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
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

  const filteredTasks =
    taskFilter === "all" ? tasks : tasks.filter((t) => t.status === taskFilter);

  const taskCounts = {
    all: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-muted rounded w-64"></div>
        <div className="h-32 bg-muted rounded"></div>
        <div className="h-32 bg-muted rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="tasks" className="gap-2">
            <ListTodo className="h-4 w-4" />
            My Tasks
            {taskCounts.pending > 0 && (
              <Badge variant="secondary" className="ml-1">
                {taskCounts.pending}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Project Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4">
          {/* Task Filter */}
          <div className="flex items-center gap-4 mb-4">
            <Select
              value={taskFilter}
              onValueChange={(value: "all" | "pending" | "in_progress" | "completed") =>
                setTaskFilter(value)
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter tasks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tasks ({taskCounts.all})</SelectItem>
                <SelectItem value="pending">Pending ({taskCounts.pending})</SelectItem>
                <SelectItem value="in_progress">In Progress ({taskCounts.in_progress})</SelectItem>
                <SelectItem value="completed">Completed ({taskCounts.completed})</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tasks List */}
          {filteredTasks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ListTodo className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No tasks found</h3>
                <p className="text-muted-foreground">
                  {taskFilter === "all"
                    ? "You don't have any tasks assigned yet"
                    : `No ${taskFilter.replace("_", " ")} tasks`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredTasks.map((task) => (
                <Card key={task.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusIcon(task.status)}
                          <CardTitle className="text-base">{task.title}</CardTitle>
                        </div>
                        <CardDescription className="flex items-center gap-2">
                          <FileText className="h-3 w-3" />
                          {task.project?.title || "Unknown Project"}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className={getStatusColor(task.status)}>
                        {task.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {task.description && (
                      <p className="text-sm text-muted-foreground mb-3">{task.description}</p>
                    )}

                    {task.note && (
                      <div className="bg-muted/50 p-2 rounded-md mb-3">
                        <p className="text-xs text-muted-foreground italic line-clamp-2">
                          "{task.note.content}"
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>From: {task.assigner?.name || "Unknown"}</span>
                        </div>
                        {task.due_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Select
                          value={task.status}
                          onValueChange={(value: "pending" | "in_progress" | "completed") =>
                            handleUpdateTaskStatus(task.id, value)
                          }
                        >
                          <SelectTrigger className="h-8 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => navigate(`/workspace/${task.project_id}`)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Open
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          {notes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No notes yet</h3>
                <p className="text-muted-foreground">
                  Notes from your projects will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {notes.map((note) => (
                <Card key={note.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {note.project?.title || "Unknown Project"}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            v{note.version?.version_number} - {note.version?.title || "Untitled"}
                          </Badge>
                        </CardDescription>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/workspace/${note.project_id}`)}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[10px]">
                          {note.user ? getInitials(note.user.name) : "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span>{note.user?.name || "Unknown"}</span>
                      <span>•</span>
                      <span>{new Date(note.created_at).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MyTasksTab;
