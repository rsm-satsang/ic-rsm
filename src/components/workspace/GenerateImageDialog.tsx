import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  userId: string;
  defaultPrompt?: string;
}

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] || "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

export default function GenerateImageDialog({ open, onOpenChange, projectId, userId, defaultPrompt = "" }: Props) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => { setImages([]); setSelected(null); setPrompt(defaultPrompt); };

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error("Enter a prompt"); return; }
    setLoading(true);
    setImages([]);
    setSelected(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-article-image", {
        body: { prompt, count: 3 },
      });
      if (error) throw error;
      if (!data?.images?.length) throw new Error("No images returned");
      setImages(data.images);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to generate images");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async () => {
    if (selected === null) return;
    setSaving(true);
    try {
      const dataUrl = images[selected];
      const blob = dataUrlToBlob(dataUrl);
      const ext = (blob.type.split("/")[1] || "png").split("+")[0];
      const path = `${projectId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("project-images")
        .upload(path, blob, { contentType: blob.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("project-images").getPublicUrl(path);
      const { error: insErr } = await supabase.from("project_images").insert({
        project_id: projectId,
        image_url: pub.publicUrl,
        storage_path: path,
        prompt,
        created_by: userId,
      });
      if (insErr) throw insErr;
      toast.success("Image saved to project");
      onOpenChange(false);
      reset();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to save image");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Generate an image for the article</DialogTitle>
          <DialogDescription>
            Describe the image. We'll generate 3 drafts using Gemini — pick your favorite.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A serene watercolor lotus floating on calm blue water at sunrise..."
            rows={3}
            disabled={loading}
          />
          <Button onClick={handleGenerate} disabled={loading || !prompt.trim()} variant="gradient">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : "Generate Image"}
          </Button>

          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-3 pt-2">
              {images.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelected(i)}
                  className={`relative rounded-md overflow-hidden border-2 transition ${
                    selected === i ? "border-primary ring-2 ring-primary" : "border-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  <img src={src} alt={`Draft ${i + 1}`} className="w-full h-auto block" />
                  {selected === i && (
                    <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSelect} disabled={selected === null || saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Use selected image"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
