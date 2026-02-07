import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Save, FileText, MessageSquare, Settings2 } from "lucide-react";
import VersionNotesPanel from "./VersionNotesPanel";

interface SavePanelProps {
  projectId: string;
  versionId: string | null;
  projectTitle: string;
  onProjectTitleChange: (title: string) => void;
  onSaveTitle: () => Promise<void>;
  savingTitle: boolean;
  originalTitle: string;
  currentStatus: "draft" | "in_progress" | "review" | "approved" | "published";
  onStatusChange: (status: "draft" | "in_progress" | "review" | "approved" | "published") => void;
  onSaveCurrentVersion: () => Promise<void>;
  onSaveAs: (versionName: string) => Promise<void>;
  saving: boolean;
}

const SavePanel = ({
  projectId,
  versionId,
  projectTitle,
  onProjectTitleChange,
  onSaveTitle,
  savingTitle,
  originalTitle,
  currentStatus,
  onStatusChange,
  onSaveCurrentVersion,
  onSaveAs,
  saving,
}: SavePanelProps) => {
  const [versionName, setVersionName] = useState("");

  const handleSaveAs = async () => {
    if (!versionName.trim()) return;
    await onSaveAs(versionName.trim());
    setVersionName("");
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Save className="h-5 w-5" />
          Save & Manage
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Edit title, status, notes, and save your work
        </p>
      </div>

      <Tabs defaultValue="details" className="flex-1 flex flex-col">
        <TabsList className="w-full grid grid-cols-3 h-auto p-1 mx-4 mt-2 bg-muted rounded-lg" style={{ width: "calc(100% - 2rem)" }}>
          <TabsTrigger 
            value="details" 
            className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm py-2 text-xs gap-1"
          >
            <Settings2 className="h-3 w-3" />
            Details
          </TabsTrigger>
          <TabsTrigger 
            value="notes" 
            className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm py-2 text-xs gap-1"
          >
            <MessageSquare className="h-3 w-3" />
            Notes
          </TabsTrigger>
          <TabsTrigger 
            value="save" 
            className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm py-2 text-xs gap-1"
          >
            <FileText className="h-3 w-3" />
            Save As
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="flex-1 m-0 p-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-6">
              {/* Title Section */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Project Title</Label>
                <Input
                  value={projectTitle}
                  onChange={(e) => onProjectTitleChange(e.target.value)}
                  placeholder="Enter project title..."
                  className="w-full"
                />
                <Button
                  size="sm"
                  onClick={onSaveTitle}
                  disabled={savingTitle || projectTitle === originalTitle}
                  className="w-full"
                >
                  {savingTitle ? "Saving..." : "Save Title"}
                </Button>
              </div>

              <Separator />

              {/* Status Section */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Project Status</Label>
                <Select value={currentStatus} onValueChange={onStatusChange}>
                  <SelectTrigger className="w-full">
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
                <p className="text-xs text-muted-foreground">
                  Change the workflow status of this project
                </p>
              </div>

              <Separator />

              {/* Quick Save Section */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Quick Save</Label>
                <Button
                  onClick={onSaveCurrentVersion}
                  disabled={saving}
                  className="w-full"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Saving..." : "Save Current Version"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Save changes to the current version
                </p>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="notes" className="flex-1 m-0 p-0 overflow-hidden">
          <VersionNotesPanel
            projectId={projectId}
            versionId={versionId}
          />
        </TabsContent>

        <TabsContent value="save" className="flex-1 m-0 p-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Create New Version</Label>
                <p className="text-xs text-muted-foreground">
                  Save your current work as a new named version
                </p>
                <Input
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="Enter version name (e.g., 'Final Draft')"
                  className="w-full"
                />
                <Button
                  onClick={handleSaveAs}
                  disabled={saving || !versionName.trim()}
                  className="w-full"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Saving..." : "Save As New Version"}
                </Button>
              </div>

              <Separator />

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-medium">Tips</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Use descriptive names like "Client Review v2"</li>
                  <li>• Versions are saved in the sidebar for easy access</li>
                  <li>• You can always go back to previous versions</li>
                </ul>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SavePanel;
