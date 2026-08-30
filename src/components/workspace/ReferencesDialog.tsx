import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { intakeAPI, ReferenceFile } from "@/lib/api/intake";

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function ReferencesDialog({ projectId, open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<ReferenceFile[]>([]);

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    intakeAPI
      .getReferenceFiles(projectId)
      .then((f) => setFiles(f || []))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [open, projectId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Reference texts</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[65vh] pr-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No reference files for this project.</p>
          ) : (
            <div className="space-y-4">
              {files.map((f) => (
                <div key={f.id} className="rounded-lg border">
                  <div className="px-3 py-2 border-b bg-muted/50 text-sm font-medium">
                    {f.file_name || "(untitled reference)"}
                    <span className="ml-2 text-xs text-muted-foreground">{f.file_type} · {f.status}</span>
                  </div>
                  <pre className="text-xs whitespace-pre-wrap p-3 max-h-72 overflow-y-auto">
                    {f.extracted_text || f.user_notes || "No extracted text available."}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
