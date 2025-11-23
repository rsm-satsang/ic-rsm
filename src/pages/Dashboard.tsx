import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  LogOut,
  Search,
  Filter,
  Clock,
  Users,
  Settings,
  StickyNote,
  Bell,
  Trash2,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CollaboratorCount from "@/components/workspace/CollaboratorCount";
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
}

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
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

  const handleDeleteProject = async () => {
    if (!deletingProject) return;

    try {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", deletingProject.id);

      if (error) throw error;

      toast.success("Project deleted successfully");
      setProjects(projects.filter(p => p.id !== deletingProject.id));
      setDeletingProject(null);
    } catch (error: any) {
      console.error("Delete failed:", error);
      toast.error(error?.message || "Failed to delete project");
    }
  };

  const filteredProjects = projects.filter((project) =>
    project.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
                <h1 className="text-2xl font-bold">RSM InnerContent</h1>
                <p className="text-sm text-muted-foreground">Content Collaboration</p>
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
          <Card className="border-2 border-primary/20 hover:border-primary/40 transition-all cursor-pointer shadow-glow" onClick={createQuickNote}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-primary rounded-xl">
                  <StickyNote className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle>New Quick Notepad</CardTitle>
                  <CardDescription>Start writing immediately</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

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

        {/* Search and Filter */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <Card
              key={project.id}
              className="hover:shadow-lg transition-all group relative"
            >
              <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(`/project/${project.id}/intake`)}>
                      Open
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setDeletingProject(project)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div onClick={() => navigate(`/project/${project.id}/intake`)} className="cursor-pointer">
                <CardHeader>
                  <div className="flex items-start justify-between mb-2 pr-8">
                    <Badge variant="secondary">{project.type}</Badge>
                    <Badge
                    variant={
                      project.status === "published"
                        ? "default"
                        : project.status === "review"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {project.status}
                  </Badge>
                </div>
                <CardTitle className="text-lg">{project.title}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {project.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>{new Date(project.updated_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <CollaboratorCount projectId={project.id} ownerId={project.owner_id} userId={user?.id || ""} />
                  </div>
                </div>
              </CardContent>
              </div>
            </Card>
          ))}
        </div>

        {filteredProjects.length === 0 && (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? "No projects match your search"
                : "Create your first project to get started"}
            </p>
            {!searchQuery && (
              <Button onClick={createQuickNote}>
                <Plus className="mr-2 h-4 w-4" />
                Create Quick Note
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingProject} onOpenChange={() => setDeletingProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingProject?.title}"? This action cannot be undone and will delete all versions, comments, and related data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
