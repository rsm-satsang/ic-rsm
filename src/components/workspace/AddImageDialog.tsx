import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  projectId: string;
  userId: string;
  onUploaded?: (image: { url: string; caption: string | null }) => void;
}

export default function AddImageDialog({ projectId, userId, onUploaded }: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setFile(null); setCaption(""); };

  const handleUpload = async () => {
    if (!file) { toast.error("Select an image"); return; }
    if (!file.type.startsWith("image/")) { toast.error("File must be an image"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("Max image size is 20MB"); return; }

    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${projectId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("project-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("project-images").getPublicUrl(path);
      const { error: insErr } = await supabase.from("project_images").insert({
        project_id: projectId,
        image_url: pub.publicUrl,
        storage_path: path,
        prompt: caption || `Uploaded: ${file.name}`,
        created_by: userId,
      });
      if (insErr) throw insErr;
      toast.success("Image added to project");
      setOpen(false);
      reset();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ImagePlus className="h-4 w-4" />
          Add Image
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload an image</DialogTitle>
          <DialogDescription>Add an image from your device to this project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()} className="w-full gap-2">
            <Upload className="h-4 w-4" />
            {file ? file.name : "Choose image..."}
          </Button>
          {file && file.type.startsWith("image/") && (
            <img src={URL.createObjectURL(file)} alt="preview" className="w-full max-h-64 object-contain rounded border" />
          )}
          <Input
            placeholder="Caption (optional)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>Cancel</Button>
          <Button onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
