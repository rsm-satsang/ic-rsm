import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Clock, RotateCcw, GitCompare } from "lucide-react";
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
                    toast.info("Compare feature coming soon!");
                  }}
                >
                  <GitCompare className="h-3 w-3" />
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
    </div>
  );
};

export default VersionsSidebar;
