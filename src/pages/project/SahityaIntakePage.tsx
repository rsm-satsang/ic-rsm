import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ReferenceUploader } from "@/components/upload/ReferenceUploader";
import { JobStatusCard } from "@/components/ui/JobStatusCard";
import { useExtractionJobs } from "@/hooks/useExtractionJobs";
import { intakeAPI } from "@/lib/api/intake";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PageNavigationBanner from "@/components/ui/PageNavigationBanner";
import { ArrowRight, Loader2, Sparkles, BookOpen, Languages } from "lucide-react";

export default function SahityaIntakePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [projectTitle, setProjectTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [translating, setTranslating] = useState(false);
  const [resultText, setResultText] = useState("");

  const {
    referenceFiles,
    allJobsComplete,
    totalJobs,
    invalidateJobs,
  } = useExtractionJobs(projectId);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .single();
        if (error) throw error;
        setProject(data);
        setProjectTitle(data.title || "");
      } catch (e: any) {
        console.error(e);
        toast.error("Failed to load project");
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  const saveTitle = useCallback(
    async (title: string) => {
      if (!title.trim()) return;
      setSavingTitle(true);
      try {
        await supabase
          .from("projects")
          .update({ title, updated_at: new Date().toISOString() })
          .eq("id", projectId);
      } catch (e) {
        console.error(e);
      } finally {
        setSavingTitle(false);
      }
    },
    [projectId],
  );

  const handleTitleChange = (v: string) => {
    setProjectTitle(v);
    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    titleSaveTimerRef.current = setTimeout(() => saveTitle(v), 800);
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      await intakeAPI.deleteReferenceFile(fileId);
      toast.success("Reference deleted");
      invalidateJobs();
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete");
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
      invalidateJobs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleTranslate = async () => {
    if (totalJobs === 0) {
      toast.error("Please upload at least one Sahitya reference (image or text)");
      return;
    }
    setTranslating(true);
    setResultText("");
    try {
      const { data, error } = await supabase.functions.invoke("translate-sahitya", {
        body: { projectId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResultText(data?.text || "");
      toast.success("Translation and topics generated!");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Translation failed");
    } finally {
      setTranslating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle ml-14">
      <PageNavigationBanner
        title="Upload Sahitya"
        leftLabel="Project Dashboard"
        leftPath="/dashboard"
        rightLabel="Edit and refine"
        rightPath={`/workspace/${projectId}`}
      />

      <div className="container max-w-4xl py-8 space-y-6">
        {/* Hero */}
        <Card className="p-6 bg-gradient-accent text-white border-0 shadow-glow">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <BookOpen className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold mb-1">📜 Hindi Sahitya Project</h1>
              <p className="text-sm text-white/90">
                Upload images or text of Hindi Sahitya. We'll extract, translate paragraph-by-paragraph,
                and suggest Substack newsletter topics.
              </p>
              <div className="mt-3">
                <Badge variant="secondary" className="bg-white/20 text-white border-0">
                  <Languages className="h-3 w-3 mr-1" />
                  Outcome: Translate & Identify topics
                </Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* Title */}
        <Card className="p-5">
          <Label className="text-sm font-semibold mb-2 block">Project Name</Label>
          <div className="flex items-center gap-2">
            <Input
              value={projectTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Tulsi Ramayan — Sundara Kanda"
              className="flex-1"
            />
            {savingTitle && <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>}
          </div>
        </Card>

        {/* Upload */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-1">📤 Upload Sahitya References</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Upload photographs of Hindi pages, scanned PDFs, or text files containing Hindi (Devanagari) content.
          </p>
          <ReferenceUploader projectId={projectId!} onUploadComplete={invalidateJobs} />
        </Card>

        {/* Files list */}
        {referenceFiles.length > 0 && (
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-3">
              References ({referenceFiles.length})
            </h3>
            <div className="space-y-2">
              {referenceFiles.map((file) => (
                <JobStatusCard
                  key={file.id}
                  file={file}
                  onDelete={handleDeleteFile}
                  onRetry={handleRetry}
                />
              ))}
            </div>
          </Card>
        )}

        {/* Action button */}
        {referenceFiles.length > 0 && (
          <Card className="p-5 bg-primary/5 border-primary/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Ready to translate?
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  We'll OCR Hindi from images, translate paragraph by paragraph, and suggest topics.
                </p>
              </div>
              <Button
                onClick={handleTranslate}
                disabled={translating || (totalJobs > 0 && !allJobsComplete)}
                size="lg"
                variant="gradient"
                className="gap-2"
              >
                {translating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Translating...
                  </>
                ) : (
                  <>
                    <Languages className="h-4 w-4" />
                    Translate and Identify topics from Sahitya
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* Result */}
        {resultText && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">📜 Translation & Topics</h2>
              <Button onClick={() => navigate(`/workspace/${projectId}`)} className="gap-2">
                Open in Workspace
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{resultText}</ReactMarkdown>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
