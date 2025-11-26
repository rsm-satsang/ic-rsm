import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { intakeAPI } from "@/lib/api/intake";

interface ReferenceUploaderProps {
  projectId: string;
  onUploadComplete?: () => void;
}

const ACCEPTED_FILE_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/plain": [".txt"],
  "image/*": [".jpg", ".jpeg", ".png", ".webp"],
  "audio/*": [".mp3", ".wav", ".m4a"],
  "video/*": [".mp4", ".mov", ".avi"],
};

const MAX_FILE_SIZE = 400 * 1024 * 1024; // 400MB

export const ReferenceUploader = ({ projectId, onUploadComplete }: ReferenceUploaderProps) => {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFileType = (file: File): string => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("audio/")) return "audio";
    if (file.type.startsWith("video/")) return "video";
    if (file.type === "application/pdf") return "pdf";
    if (file.type.includes("wordprocessingml")) return "docx";
    if (file.type === "text/plain") return "txt";
    return "unknown";
  };

  const uploadFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File ${file.name} exceeds 400MB limit`);
      return;
    }

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${projectId}/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("project-references")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create reference file and queue extraction
      await intakeAPI.uploadReferenceFile({
        project_id: projectId,
        storage_path: filePath,
        file_name: file.name,
        file_type: getFileType(file),
        size_bytes: file.size,
      });

      toast.success(`${file.name} uploaded successfully`);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(`Failed to upload ${file.name}: ${error.message}`);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map((file) => uploadFile(file));
      await Promise.all(uploadPromises);
      onUploadComplete?.();
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  return (
    <Card
      className={`p-4 border-2 border-dashed transition-colors ${
        dragActive ? "border-primary bg-primary/5" : "border-border"
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <Upload className="h-6 w-6 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              Drag and drop files here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              PDF, DOCX, TXT, Images, Audio, Video (max 400MB)
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={Object.keys(ACCEPTED_FILE_TYPES).join(",")}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          variant="outline"
          className="flex-shrink-0"
        >
          {uploading ? "Uploading..." : "Select Files"}
        </Button>
      </div>
    </Card>
  );
};
