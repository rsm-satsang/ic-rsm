import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { JobStatusCard } from "@/components/ui/JobStatusCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useExtractionJobs } from "@/hooks/useExtractionJobs";
import { intakeAPI, ReferenceFile } from "@/lib/api/intake";
import { ReferenceUploader } from "@/components/upload/ReferenceUploader";
import { toast } from "sonner";
import { Plus, RefreshCw, ChevronDown } from "lucide-react";

interface ReferenceSidebarProps {
  projectId: string;
}

export const ReferenceSidebar = ({ projectId }: ReferenceSidebarProps) => {
  const [viewingFile, setViewingFile] = useState<ReferenceFile | null>(null);
  const [uploaderOpen, setUploaderOpen] = useState(false);
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
      
      // When extraction completes, augment v1 instead of redirecting
      // The extraction job system will handle this automatically
      invalidateJobs();
    } catch (error: any) {
      console.error("Error retrying extraction:", error);
      toast.error("Failed to retry extraction");
    }
  };

  return (
    <>
      <div className="flex flex-col h-full w-full">
        <div className="p-4 border-b flex-shrink-0">
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

        <div className="p-4 border-t flex-shrink-0">
          <Collapsible open={uploaderOpen} onOpenChange={setUploaderOpen}>
            <CollapsibleTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add More References
                <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${uploaderOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <ReferenceUploader 
                projectId={projectId} 
                onUploadComplete={invalidateJobs}
              />
            </CollapsibleContent>
          </Collapsible>
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
