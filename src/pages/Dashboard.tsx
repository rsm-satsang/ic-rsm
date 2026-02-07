import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  LogOut,
  Settings,
  Bell,
  ListTodo,
  FolderOpen,
} from "lucide-react";
import MyTasksTab from "@/components/dashboard/MyTasksTab";
import ProjectsTable from "@/components/dashboard/ProjectsTable";
import type { User } from "@supabase/supabase-js";

interface Project {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
  owner_id: string;
  metadata: any;
}

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0);
  const [activeTab, setActiveTab] = useState("projects");
  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (!currentUser) {
        navigate("/auth");
        return;
      }

      setUser(currentUser);
      await fetchProjects(currentUser.id);
      await fetchPendingInvites(currentUser.id);
      await fetchPendingTasksCount(currentUser.id);
    } catch (error) {
      console.error("Error checking user:", error);
      navigate("/auth");
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async (userId: string) => {
    try {
      // Get projects where user is owner
      const { data: ownedProjects, error: ownedError } = await supabase
        .from("projects")
        .select("*")
        .eq("owner_id", userId);

      if (ownedError) throw ownedError;

      // Get projects where user is a collaborator
      const { data: collabData, error: collabError } = await supabase
        .from("collaborators")
        .select("project_id")
        .eq("user_id", userId);

      if (collabError) throw collabError;

      const collabProjectIds = collabData?.map((c) => c.project_id) || [];

      // Get the actual project data for collaborated projects
      let collabProjects: Project[] = [];
      if (collabProjectIds.length > 0) {
        const { data: collabProjectsData, error: collabProjectsError } = await supabase
          .from("projects")
          .select("*")
          .in("id", collabProjectIds);

        if (collabProjectsError) throw collabProjectsError;
        collabProjects = collabProjectsData || [];
      }

      // Combine and deduplicate projects
      const allProjects = [...(ownedProjects || []), ...collabProjects];
      const uniqueProjects = Array.from(
        new Map(allProjects.map((p) => [p.id, p])).values()
      );

      // Sort by updated_at
      uniqueProjects.sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );

      setProjects(uniqueProjects);
    } catch (error: any) {
      toast.error("Failed to load projects");
      console.error(error);
    }
  };

  const fetchPendingInvites = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("invitations")
        .select("id")
        .eq("invited_user_id", userId)
        .eq("status", "pending");

      if (error) throw error;
      setPendingInvitesCount(data?.length || 0);
    } catch (error) {
      console.error("Error fetching pending invites:", error);
    }
  };

  const fetchPendingTasksCount = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_tasks")
        .select("id")
        .eq("assigned_to", userId)
        .in("status", ["pending", "in_progress"]);

      if (error) throw error;
      setPendingTasksCount(data?.length || 0);
    } catch (error) {
      console.error("Error fetching pending tasks:", error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const createQuickNote = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          title: `Quick Note - ${new Date().toLocaleDateString()}`,
          type: "note",
          owner_id: user.id,
          status: "draft",
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Quick notepad created!");
      navigate(`/project/${data.id}/intake`);
    } catch (error: any) {
      toast.error("Failed to create note");
      console.error(error);
    }
  };

  const createNewProject = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          title: `New Project - ${new Date().toLocaleDateString()}`,
          type: "document",
          owner_id: user.id,
          status: "draft",
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Project created!");
      navigate(`/project/${data.id}/intake`);
    } catch (error: any) {
      toast.error("Failed to create project");
      console.error(error);
    }
  };

  const handleProjectDeleted = (projectId: string) => {
    setProjects(projects.filter(p => p.id !== projectId));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-primary rounded-xl">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Srijan</h1>
                <p className="text-sm text-muted-foreground">Content Creation for RSM</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => navigate("/notifications")}
                className="relative"
              >
                <Bell className="h-5 w-5" />
                {pendingInvitesCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {pendingInvitesCount}
                  </span>
                )}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
                <Settings className="h-5 w-5" />
              </Button>
              <Button variant="ghost" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Card className="border-2 border-secondary/20 hover:border-secondary/40 transition-all cursor-pointer" onClick={createNewProject}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-accent rounded-xl">
                  <Plus className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle>New Project</CardTitle>
                  <CardDescription>Create a full project with settings</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Tabs for Projects and Tasks */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="projects" className="gap-2">
              <FolderOpen className="h-4 w-4" />
              My Projects
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2">
              <ListTodo className="h-4 w-4" />
              My Tasks
              {pendingTasksCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {pendingTasksCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="space-y-6">
            {user && (
              <ProjectsTable 
                projects={projects} 
                userId={user.id} 
                onProjectDeleted={handleProjectDeleted} 
              />
            )}
            
            {projects.length === 0 && (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first project to get started
                </p>
                <Button onClick={createNewProject}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Project
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="tasks">
            {user && <MyTasksTab userId={user.id} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
