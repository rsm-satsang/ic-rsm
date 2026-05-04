import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ImageIcon, Download } from "lucide-react";
import { toast } from "sonner";

interface ProjectImage {
  id: string;
  image_url: string;
  storage_path: string | null;
  prompt: string | null;
  created_at: string;
}

interface Props {
  projectId: string;
}

const ProjectImagesSection = ({ projectId }: Props) => {
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchImages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("project_images")
      .select("id, image_url, storage_path, prompt, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
    } else {
      setImages(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchImages();
    const channel = supabase
      .channel(`project-images-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_images", filter: `project_id=eq.${projectId}` },
        () => fetchImages()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleDownload = async (img: ProjectImage) => {
    try {
      const res = await fetch(img.image_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = (blob.type.split("/")[1] || "png").split("+")[0];
      a.download = `project-image-${img.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to download image");
    }
  };

  return (
    <div className="border-t">
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          Project Images
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {images.length} image{images.length !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-20 bg-muted rounded" />
            <div className="h-20 bg-muted rounded" />
          </div>
        ) : images.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No images yet</p>
            <p className="text-xs">Generate one from the editor above</p>
          </div>
        ) : (
          images.map((img) => (
            <div key={img.id} className="border rounded-lg overflow-hidden bg-card">
              <a href={img.image_url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={img.image_url}
                  alt={img.prompt || "Project image"}
                  className="w-full h-auto block"
                  loading="lazy"
                />
              </a>
              <div className="p-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground truncate">
                  {new Date(img.created_at).toLocaleDateString()}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => handleDownload(img)}
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProjectImagesSection;
