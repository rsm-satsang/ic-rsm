import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DiffMatchPatch } from "diff-match-patch";

interface Version {
  id: string;
  version_number: number;
  title: string | null;
  content: string;
  created_at: string;
}

interface VersionCompareDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialVersionId?: string;
}

const VersionCompareDialog = ({ projectId, open, onOpenChange, initialVersionId }: VersionCompareDialogProps) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [version1Id, setVersion1Id] = useState<string>("");
  const [version2Id, setVersion2Id] = useState<string>("");
  const [diffHtml, setDiffHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchVersions();
      if (initialVersionId) {
        setVersion1Id(initialVersionId);
      }
    }
  }, [open, projectId, initialVersionId]);

  useEffect(() => {
    if (version1Id && version2Id) {
      performDiff();
    } else {
      setDiffHtml("");
    }
  }, [version1Id, version2Id]);

  const fetchVersions = async () => {
    try {
      const { data, error } = await supabase
        .from("versions")
        .select("id, version_number, title, content, created_at")
        .eq("project_id", projectId)
        .order("version_number", { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (error: any) {
      console.error("Error fetching versions:", error);
      toast.error("Failed to load versions");
    }
  };

  const performDiff = async () => {
    setLoading(true);
    try {
      const v1 = versions.find(v => v.id === version1Id);
      const v2 = versions.find(v => v.id === version2Id);

      if (!v1 || !v2) {
        setDiffHtml("");
        return;
      }

      const dmp = new DiffMatchPatch();
      const diff = dmp.diff_main(v1.content, v2.content);
      dmp.diff_cleanupSemantic(diff);

      // Convert diff to HTML
      let html = "";
      diff.forEach(([operation, text]) => {
        const escaped = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br/>");

        if (operation === 1) {
          // Addition
          html += `<span class="bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100">${escaped}</span>`;
        } else if (operation === -1) {
          // Deletion
          html += `<span class="bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-100 line-through">${escaped}</span>`;
        } else {
          // No change
          html += `<span class="text-foreground">${escaped}</span>`;
        }
      });

      setDiffHtml(html);
    } catch (error: any) {
      console.error("Error performing diff:", error);
      toast.error("Failed to compare versions");
    } finally {
      setLoading(false);
    }
  };

  const getVersionLabel = (version: Version) => {
    return `v${version.version_number} - ${version.title || 'Untitled'} (${new Date(version.created_at).toLocaleDateString()})`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Compare Versions</DialogTitle>
          <DialogDescription>
            Select two versions to see what changed between them
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Version 1 (Older)</Label>
            <Select value={version1Id} onValueChange={setVersion1Id}>
              <SelectTrigger>
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    {getVersionLabel(version)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Version 2 (Newer)</Label>
            <Select value={version2Id} onValueChange={setVersion2Id}>
              <SelectTrigger>
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>
                    {getVersionLabel(version)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-sm text-muted-foreground mt-2">Comparing versions...</p>
          </div>
        )}

        {!loading && diffHtml && (
          <div className="space-y-2">
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="h-4 w-8"></Badge>
                <span className="text-muted-foreground">Removed</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="h-4 w-8 bg-green-500"></Badge>
                <span className="text-muted-foreground">Added</span>
              </div>
            </div>
            <ScrollArea className="h-[400px] w-full border rounded-md p-4">
              <div 
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: diffHtml }}
              />
            </ScrollArea>
          </div>
        )}

        {!loading && !diffHtml && version1Id && version2Id && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No differences found between these versions</p>
          </div>
        )}

        {!version1Id && !version2Id && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Select two versions to compare</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default VersionCompareDialog;
