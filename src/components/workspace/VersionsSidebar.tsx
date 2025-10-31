import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, GitCompare, Plus } from "lucide-react";
import { toast } from "sonner";

interface Version {
  id: string;
  version_number: number;
  title: string | null;
  description: string | null;
  created_at: string;
  created_by: string;
}

interface VersionsSidebarProps {
  projectId: string;
}

const VersionsSidebar = ({ projectId }: VersionsSidebarProps) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  useEffect(() => {
    loadVersions();
  }, [projectId]);

  const loadVersions = async () => {
    try {
      const { data, error } = await supabase
        .from("versions")
        .select("*")
        .eq("project_id", projectId)
        .order("version_number", { ascending: false });

      if (error) throw error;

      setVersions(data || []);
      if (data && data.length > 0) {
        setSelectedVersion(data[0].id);
      }
    } catch (error: any) {
      toast.error("Failed to load versions");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const createNewVersion = async () => {
    try {
      const maxVersion = Math.max(...versions.map((v) => v.version_number), 0);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("versions")
        .insert({
          project_id: projectId,
          version_number: maxVersion + 1,
          title: `Version ${maxVersion + 1}`,
          content: "",
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("New version created!");
      await loadVersions();
    } catch (error: any) {
      toast.error("Failed to create version");
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="space-y-3">
          <div className="h-12 bg-muted rounded animate-pulse"></div>
          <div className="h-12 bg-muted rounded animate-pulse"></div>
          <div className="h-12 bg-muted rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Versions</h3>
          <Button size="sm" variant="outline" onClick={createNewVersion}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Button size="sm" variant="secondary" className="w-full">
          <GitCompare className="mr-2 h-4 w-4" />
          Compare Versions
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {versions.map((version) => (
            <div
              key={version.id}
              className={`p-3 rounded-lg border cursor-pointer transition-all hover:border-primary/50 ${
                selectedVersion === version.id
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
              onClick={() => setSelectedVersion(version.id)}
            >
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline">v{version.version_number}</Badge>
                {version.version_number === Math.max(...versions.map((v) => v.version_number)) && (
                  <Badge variant="default" className="text-xs">Latest</Badge>
                )}
              </div>
              <p className="font-medium text-sm mb-1">
                {version.title || `Version ${version.version_number}`}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(version.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default VersionsSidebar;
