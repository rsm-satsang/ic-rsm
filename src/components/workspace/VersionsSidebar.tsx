import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Clock, RotateCcw, GitCompare, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";

interface Version {
  id: string;
  version_number: number;
  title: string | null;
  description: string | null;
  content: string;
  created_at: string;
  created_by: string;
}

interface VersionsSidebarProps {
  projectId: string;
}

const VersionsSidebar = ({ projectId }: VersionsSidebarProps) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<Version | null>(null);
  const [editedTitle, setEditedTitle] = useState("");
  const [deletingVersion, setDeletingVersion] = useState<Version | null>(null);

  useEffect(() => {
    fetchVersions();
    
    // Subscribe to version changes
    const channel = supabase
      .channel(`versions:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "versions",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          fetchVersions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const fetchVersions = async () => {
    try {
      const { data, error } = await supabase
        .from("versions")
        .select("*")
        .eq("project_id", projectId)
        .order("version_number", { ascending: false });

      if (error) throw error;

      setVersions(data || []);
    } catch (error: any) {
      console.error("Error fetching versions:", error);
      toast.error("Failed to load versions");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (version: Version) => {
    try {
      // Get current max version number
      const { data: maxVersionData } = await supabase
        .from("versions")
        .select("version_number")
        .eq("project_id", projectId)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      const newVersionNumber = (maxVersionData?.version_number || 0) + 1;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create new version with restored content
      const { error } = await supabase.from("versions").insert({
        project_id: projectId,
        version_number: newVersionNumber,
        title: `Restored from v${version.version_number}`,
        description: `Restored version ${version.version_number}`,
        content: version.content,
        created_by: user.id,
      });

      if (error) throw error;

      toast.success(`Version ${version.version_number} restored successfully!`);
      
      // Reload to show updated content
      window.location.reload();
    } catch (error: any) {
      console.error("Error restoring version:", error);
      toast.error("Failed to restore version");
    }
  };

  const handleEditVersion = async () => {
    if (!editingVersion || !editedTitle.trim()) return;

    try {
      const { error } = await supabase
        .from("versions")
        .update({ title: editedTitle.trim() })
        .eq("id", editingVersion.id);

      if (error) throw error;

      toast.success("Version name updated successfully!");
      setEditingVersion(null);
      setEditedTitle("");
      fetchVersions();
    } catch (error: any) {
      console.error("Error updating version:", error);
      toast.error("Failed to update version name");
    }
  };

  const handleDeleteVersion = async () => {
    if (!deletingVersion) return;

    try {
      const { error } = await supabase
        .from("versions")
        .delete()
        .eq("id", deletingVersion.id);

      if (error) throw error;

      toast.success("Version deleted successfully!");
      setDeletingVersion(null);
      fetchVersions();
    } catch (error: any) {
      console.error("Error deleting version:", error);
      toast.error("Failed to delete version");
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-3/4"></div>
          <div className="h-20 bg-muted rounded"></div>
          <div className="h-20 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Versions
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {versions.length} version{versions.length !== 1 ? "s" : ""}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {versions.map((version) => (
            <div
              key={version.id}
              className={`p-3 border rounded-lg cursor-pointer transition-all hover:border-primary ${
                selectedVersionId === version.id ? "border-primary bg-primary/5" : ""
              }`}
              onClick={() => {
                setSelectedVersionId(version.id);
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <Badge variant="secondary">v{version.version_number}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(version.created_at).toLocaleDateString()}
                </span>
              </div>
              
              <h4 className="font-medium text-sm mb-1">
                {version.title || `Version ${version.version_number}`}
              </h4>
              
              {version.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                  {version.description}
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRestore(version);
                  }}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingVersion(version);
                    setEditedTitle(version.title || `Version ${version.version_number}`);
                  }}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.info("Compare feature coming soon!");
                  }}
                >
                  <GitCompare className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingVersion(version);
                  }}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          {versions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No versions yet</p>
              <p className="text-xs">Versions will appear here after saving</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Edit Version Dialog */}
      <Dialog open={!!editingVersion} onOpenChange={(open) => !open && setEditingVersion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Version Name</DialogTitle>
            <DialogDescription>
              Change the name of version {editingVersion?.version_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="version-title">Version Name</Label>
              <Input
                id="version-title"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editedTitle.trim()) {
                    handleEditVersion();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingVersion(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditVersion} disabled={!editedTitle.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Version Alert Dialog */}
      <AlertDialog open={!!deletingVersion} onOpenChange={(open) => !open && setDeletingVersion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Version</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete version {deletingVersion?.version_number} ({deletingVersion?.title || 'Untitled'})?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVersion} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VersionsSidebar;
