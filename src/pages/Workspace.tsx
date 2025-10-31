import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Save, Settings } from "lucide-react";
import CollaborativeEditor from "@/components/workspace/CollaborativeEditor";
import VersionsSidebar from "@/components/workspace/VersionsSidebar";
import AIToolsPanel from "@/components/workspace/AIToolsPanel";
import TimelineFeed from "@/components/workspace/TimelineFeed";
import InviteDialog from "@/components/workspace/InviteDialog";
import type { User } from "@supabase/supabase-js";

interface Project {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: "draft" | "in_progress" | "review" | "approved" | "published";
  owner_id: string;
}

const Workspace = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [currentStatus, setCurrentStatus] = useState<"draft" | "in_progress" | "review" | "approved" | "published">("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [editorRef, setEditorRef] = useState<any>(null);
  const [showVersionDialog, setShowVersionDialog] = useState(false);
  const [versionName, setVersionName] = useState("");

  const handleTextSelection = (text: string) => {
    setSelectedText(text);
  };

  const handleInsertText = (text: string) => {
    console.log("Replacing selected text with AI output:", text.substring(0, 50) + "...");
    console.log("Editor ref:", editorRef);
    
    if (editorRef?.commands) {
      // Replace selected text with AI-generated content
      // If there's a selection, deleteSelection removes it, then insertContent adds new text
      editorRef.chain().focus().deleteSelection().insertContent(text).run();
      toast.success("Content replaced successfully!");
    } else {
      console.error("Editor reference not available");
      toast.error("Editor not ready. Please try again.");
    }
  };

  const handleEditorReady = (editor: any) => {
    console.log("Editor ready, setting ref");
    setEditorRef(editor);
  };

  useEffect(() => {
    checkUserAndLoadProject();
  }, [projectId]);

  const checkUserAndLoadProject = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (!currentUser) {
        navigate("/auth");
        return;
      }

      setUser(currentUser);

      if (projectId) {
        await loadProject(projectId);
      }
    } catch (error) {
      console.error("Error:", error);
      navigate("/auth");
    } finally {
      setLoading(false);
    }
  };

  const loadProject = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      setProject(data);
      setProjectTitle(data.title);
      setCurrentStatus(data.status);
    } catch (error: any) {
      toast.error("Failed to load project");
      console.error(error);
      navigate("/dashboard");
    }
  };

  const handleSaveClick = () => {
    setShowVersionDialog(true);
    setVersionName("");
  };

  const handleSave = async () => {
    if (!project || !user || !versionName.trim()) return;

    setShowVersionDialog(false);
    setSaving(true);
    try {
      console.log("Starting save operation...");
      
      // Retry logic for project update
      let updateSuccess = false;
      let lastError = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`Attempt ${attempt} to update project...`);
          
          const { error: projectError } = await supabase
            .from("projects")
            .update({ 
              title: projectTitle,
              updated_at: new Date().toISOString()
            })
            .eq("id", project.id);

          if (projectError) {
            console.error(`Attempt ${attempt} failed:`, projectError);
            lastError = projectError;
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
            throw projectError;
          }
          
          console.log("Project updated successfully");
          updateSuccess = true;
          break;
        } catch (err: any) {
          console.error(`Update attempt ${attempt} error:`, err);
          lastError = err;
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      if (!updateSuccess) {
        throw lastError || new Error("Failed to update project after 3 attempts");
      }

      // Get editor content
      const editorElement = document.querySelector('.ProseMirror');
      const content = editorElement?.innerHTML || "";

      // Get current max version number
      const { data: maxVersionData } = await supabase
        .from("versions")
        .select("version_number")
        .eq("project_id", project.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      const newVersionNumber = (maxVersionData?.version_number || 0) + 1;

      // Create new version with custom name
      const { error: versionError } = await supabase.from("versions").insert({
        project_id: project.id,
        version_number: newVersionNumber,
        title: versionName.trim(),
        content: content,
        created_by: user.id,
      });

      if (versionError) throw versionError;

      // Log to timeline
      const { data: userData } = await supabase
        .from("users")
        .select("name")
        .eq("id", user.id)
        .single();

      await supabase.from("timeline").insert({
        project_id: project.id,
        event_type: "edited",
        event_details: { action: "saved", version: newVersionNumber, versionName: versionName.trim() },
        user_id: user.id,
        user_name: userData?.name || "Unknown User",
      });

      toast.success("Project saved successfully!");
      setVersionName("");
    } catch (error: any) {
      console.error("Save failed:", error);
      const errorMessage = error?.message || "Failed to save project";
      toast.error(errorMessage);
      
      // Show more detailed error in console
      if (error?.code) {
        console.error("Error code:", error.code);
      }
      if (error?.details) {
        console.error("Error details:", error.details);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: "draft" | "in_progress" | "review" | "approved" | "published") => {
    if (!project || !user) return;

    try {
      console.log("Updating status to:", newStatus);
      
      // Retry logic for status update
      let updateSuccess = false;
      let lastError = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`Attempt ${attempt} to update status...`);
          
          const { error: statusError } = await supabase
            .from("projects")
            .update({ status: newStatus })
            .eq("id", project.id);

          if (statusError) {
            console.error(`Attempt ${attempt} failed:`, statusError);
            lastError = statusError;
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
            throw statusError;
          }
          
          console.log("Status updated successfully");
          updateSuccess = true;
          break;
        } catch (err: any) {
          console.error(`Status update attempt ${attempt} error:`, err);
          lastError = err;
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      if (!updateSuccess) {
        throw lastError || new Error("Failed to update status after 3 attempts");
      }

      // Log status change
      const { data: userData } = await supabase
        .from("users")
        .select("name")
        .eq("id", user.id)
        .single();

      await supabase.from("status_history").insert({
        project_id: project.id,
        old_status: currentStatus,
        new_status: newStatus,
        changed_by: user.id,
      });

      await supabase.from("timeline").insert({
        project_id: project.id,
        event_type: "status_change",
        event_details: { from: currentStatus, to: newStatus },
        user_id: user.id,
        user_name: userData?.name || "Unknown User",
      });

      setCurrentStatus(newStatus);
      toast.success(`Status updated to ${newStatus}`);
    } catch (error: any) {
      console.error("Status update failed:", error);
      const errorMessage = error?.message || "Failed to update status";
      toast.error(errorMessage);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-subtle">
      {/* Top Bar */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <Input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="max-w-md font-semibold text-lg border-none shadow-none focus-visible:ring-0"
                placeholder="Project title..."
              />
            </div>

            <div className="flex items-center gap-3">
              <Select value={currentStatus} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>

              <InviteDialog 
                projectId={project.id} 
                projectOwnerId={project.owner_id}
                currentUserId={user?.id || ""}
              />

              <Button 
                variant="outline" 
                size="icon"
                onClick={() => navigate("/settings")}
              >
                <Settings className="h-4 w-4" />
              </Button>

              <Button onClick={handleSaveClick} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Versions */}
        <div className="w-64 border-r bg-card overflow-y-auto">
          <VersionsSidebar projectId={project.id} />
        </div>

        {/* Center - Editor */}
        <div className="flex-1 overflow-y-auto">
          <CollaborativeEditor 
            projectId={project.id} 
            userId={user?.id || ""} 
            onTextSelection={handleTextSelection}
            onEditorReady={handleEditorReady}
          />
        </div>

        {/* Right Sidebar - AI Tools */}
        <div className="w-80 border-l bg-card overflow-y-auto">
          <AIToolsPanel 
            projectId={project.id}
            selectedText={selectedText}
            onInsertText={handleInsertText}
          />
        </div>
      </div>

      {/* Bottom Bar - Timeline */}
      <div className="border-t bg-card">
        <TimelineFeed projectId={project.id} />
      </div>

      {/* Version Name Dialog */}
      <Dialog open={showVersionDialog} onOpenChange={setShowVersionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save New Version</DialogTitle>
            <DialogDescription>
              Give this version a meaningful name to help identify it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="version-name">Version Name</Label>
              <Input
                id="version-name"
                placeholder="e.g., Final Draft, Client Review, etc."
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && versionName.trim()) {
                    handleSave();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVersionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!versionName.trim() || saving}>
              {saving ? "Saving..." : "Save Version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Workspace;
