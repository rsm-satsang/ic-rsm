import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, Video, FileVideo } from "lucide-react";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  modifiedTime?: string;
  iconLink?: string;
}

interface GoogleDrivePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onImported?: () => void;
}

export const GoogleDrivePickerDialog = ({
  open,
  onOpenChange,
  projectId,
  onImported,
}: GoogleDrivePickerDialogProps) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);

  const fetchFiles = async (q = "") => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("gdrive-list-videos", {
        method: "GET",
        headers: {},
        body: undefined,
      } as any);
      // Note: supabase.functions.invoke doesn't support GET query params well; build URL manually
      // Falling through — actual call below
      if (error) throw error;
      setFiles(data?.files || []);
    } catch (err: any) {
      console.error("Drive list error:", err);
      toast.error(err.message || "Failed to load Google Drive videos");
    } finally {
      setLoading(false);
    }
  };

  const fetchFilesDirect = async (q = "") => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const projectRef = (import.meta as any).env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectRef}.supabase.co/functions/v1/gdrive-list-videos?q=${encodeURIComponent(q)}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Failed to list");
      setFiles(json.files || []);
    } catch (err: any) {
      console.error("Drive list error:", err);
      toast.error(err.message || "Failed to load Google Drive videos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchFilesDirect("");
    }
  }, [open]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFilesDirect(search);
  };

  const handleImport = async (file: DriveFile) => {
    setImportingId(file.id);
    try {
      const { data, error } = await supabase.functions.invoke("gdrive-import-file", {
        body: {
          project_id: projectId,
          file_id: file.id,
          file_name: file.name,
          mime_type: file.mimeType,
          size_bytes: file.size ? Number(file.size) : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${file.name} imported from Google Drive`);
      onImported?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Drive import error:", err);
      toast.error(err.message || "Failed to import file");
    } finally {
      setImportingId(null);
    }
  };

  const formatSize = (s?: string) => {
    if (!s) return "";
    const n = Number(s);
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileVideo className="h-5 w-5" />
            Select a Video from Google Drive
          </DialogTitle>
          <DialogDescription>
            Choose a video from the connected Google Drive to use as a reference.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search videos by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit" variant="outline" size="icon">
            <Search className="h-4 w-4" />
          </Button>
        </form>

        <ScrollArea className="h-96 pr-3">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              No videos found in Google Drive.
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/40 transition-colors"
                >
                  {file.thumbnailLink ? (
                    <img
                      src={file.thumbnailLink}
                      alt=""
                      className="h-12 w-16 object-cover rounded bg-muted"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-12 w-16 flex items-center justify-center bg-muted rounded">
                      <Video className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {file.mimeType} · {formatSize(file.size)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleImport(file)}
                    disabled={importingId !== null}
                  >
                    {importingId === file.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Import"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
