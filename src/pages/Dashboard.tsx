import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Plus,
  LogOut,
  Settings,
  Bell,
} from "lucide-react";
import logoImg from "@/assets/logo_rsm_lotus.png";
import feedbackIcon from "@/assets/feedback-icon.jpg";
import ProjectsTable from "@/components/dashboard/ProjectsTable";
import type { User } from "@supabase/supabase-js";
import FeedbackDialog from "@/components/FeedbackDialog";

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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0);
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

  const fetchProjects = async (_userId: string) => {
    try {
      // Fetch ALL projects - universal visibility for all authenticated users
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      setProjects(data || []);
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
    <div className="min-h-screen bg-gradient-subtle ml-14">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logoImg} alt="Srijan Logo" className="h-10 w-10 rounded-full" />
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
          <Card className="border-2 border-secondary/20 hover:border-secondary/40 transition-all cursor-pointer" onClick={() => setFeedbackOpen(true)}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-accent rounded-xl">
                  <img src={feedbackIcon} alt="Feedback" className="h-6 w-6 rounded" />
                </div>
                <div>
                  <CardTitle>Give Feedback</CardTitle>
                  <CardDescription>We would love to hear from you especially during this test period.</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Projects */}
        <div className="space-y-6">
          {user && (
            <ProjectsTable 
              projects={projects} 
              userId={user.id} 
              onProjectDeleted={handleProjectDeleted} 
            />
          )}
          
          {projects.length === 0 && (
            <div className="text-center py-12">
              <img src={logoImg} alt="Srijan Logo" className="h-12 w-12 rounded-full mx-auto mb-4 opacity-50" />
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
        </div>
      </div>
    </div>
    <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
};

export default Dashboard;
