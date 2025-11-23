import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { JobStatusCard } from "@/components/ui/JobStatusCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useExtractionJobs } from "@/hooks/useExtractionJobs";
import { intakeAPI, ReferenceFile } from "@/lib/api/intake";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";

interface ReferenceSidebarProps {
  projectId: string;
}

export const ReferenceSidebar = ({ projectId }: ReferenceSidebarProps) => {
  const [viewingFile, setViewingFile] = useState<ReferenceFile | null>(null);
  const {
    referenceFiles,
    isLoading,
    totalJobs,
    completedJobs,
    activeJobs,
    invalidateJobs,
  } = useExtractionJobs(projectId);

  const handleDeleteFile = async (fileId: string) => {
    try {
      await intakeAPI.deleteReferenceFile(fileId);
      toast.success("Reference file deleted");
      invalidateJobs();
    } catch (error: any) {
      console.error("Error deleting file:", error);
      toast.error("Failed to delete file");
    }
  };

  const handleRetry = async (fileId: string) => {
    const file = referenceFiles.find((f) => f.id === fileId);
    if (!file) return;

    try {
      await intakeAPI.queueExtraction({
        reference_file_id: fileId,
        job_type: `${file.file_type}_parse`,
      });
      toast.success("Extraction requeued");
      invalidateJobs();
    } catch (error: any) {
      console.error("Error retrying extraction:", error);
      toast.error("Failed to retry extraction");
    }
  };

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-lg">Reference Files</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={invalidateJobs}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {totalJobs > 0 && (
            <p className="text-xs text-muted-foreground">
              {completedJobs}/{totalJobs} complete
              {activeJobs > 0 && ` • ${activeJobs} in progress`}
            </p>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {referenceFiles.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-4">
                  No reference files yet
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.href = `/project/${projectId}/intake`}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add References
                </Button>
              </div>
            ) : (
              referenceFiles.map((file) => (
                <JobStatusCard
                  key={file.id}
                  file={file}
                  onDelete={handleDeleteFile}
                  onRetry={handleRetry}
                  onViewExtracted={setViewingFile}
                />
              ))
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => window.location.href = `/project/${projectId}/intake`}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add More References
          </Button>
        </div>
      </div>

      <Dialog open={!!viewingFile} onOpenChange={() => setViewingFile(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{viewingFile?.file_name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-96">
            <pre className="text-sm whitespace-pre-wrap p-4 bg-muted rounded-lg">
              {viewingFile?.extracted_text || "No extracted text available"}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};
