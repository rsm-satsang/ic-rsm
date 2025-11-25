import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { ReferenceUploader } from "@/components/upload/ReferenceUploader";
import { JobStatusCard } from "@/components/ui/JobStatusCard";
import { useExtractionJobs } from "@/hooks/useExtractionJobs";
import { intakeAPI } from "@/lib/api/intake";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  ArrowRight, 
  Loader2, 
  Youtube, 
  Link as LinkIcon,
  Sparkles
} from "lucide-react";

export default function IntakePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [goal, setGoal] = useState("substack_article");
  const [customGoal, setCustomGoal] = useState("");
  const [llmInstructions, setLlmInstructions] = useState("");
  const [vocabulary, setVocabulary] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [generating, setGenerating] = useState(false);

  const {
    referenceFiles,
    isLoading: jobsLoading,
    allJobsComplete,
    totalJobs,
    completedJobs,
    activeJobs,
    invalidateJobs,
  } = useExtractionJobs(projectId);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (error) throw error;
      setProject(data);
      setProjectTitle(data.title || "");
      
      // Load vocabulary from metadata if exists
      const metadata = data.metadata as any;
      if (metadata?.vocabulary) {
        setVocabulary(Array.isArray(metadata.vocabulary) ? metadata.vocabulary.join("\n") : metadata.vocabulary);
      }
    } catch (error: any) {
      console.error("Error loading project:", error);
      toast.error("Failed to load project");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleAddYouTube = async () => {
    if (!youtubeUrl.trim()) return;

    try {
      await intakeAPI.addYouTubeLink({
        project_id: projectId!,
        youtube_url: youtubeUrl,
      });
      toast.success("YouTube link added, extraction queued");
      setYoutubeUrl("");
      invalidateJobs();
    } catch (error: any) {
      console.error("Error adding YouTube link:", error);
      toast.error("Failed to add YouTube link");
    }
  };

  const handleAddURL = async () => {
    if (!externalUrl.trim()) return;

    try {
      await intakeAPI.addExternalURL({
        project_id: projectId!,
        url: externalUrl,
      });
      toast.success("URL added, extraction queued");
      setExternalUrl("");
      invalidateJobs();
    } catch (error: any) {
      console.error("Error adding URL:", error);
      toast.error("Failed to add URL");
    }
  };

  const handleSaveTitle = async () => {
    if (!projectTitle.trim()) {
      toast.error("Project title cannot be empty");
      return;
    }

    setSavingTitle(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({ title: projectTitle, updated_at: new Date().toISOString() })
        .eq("id", projectId);

      if (error) throw error;

      toast.success("Project title saved!");
      setProject({ ...project, title: projectTitle });
    } catch (error: any) {
      console.error("Title save failed:", error);
      toast.error("Failed to save title");
    } finally {
      setSavingTitle(false);
    }
  };

  const handleGenerateVersions = async () => {
    if (totalJobs === 0) {
      toast.error("Please add at least one reference file");
      return;
    }

    if (!allJobsComplete) {
      toast.error("Please wait for all extractions to complete");
      return;
    }

    setGenerating(true);
    try {
      const finalGoal = goal === "other" ? customGoal : goal;
      
      // Parse vocabulary into array
      const vocabArray = vocabulary
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      // Update project metadata with intake_completed and vocabulary
      const metadata = {
        ...(project.metadata || {}),
        intake_completed: true,
        vocabulary: vocabArray,
      };

      await supabase
        .from("projects")
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      
      await intakeAPI.generateVersions({
        project_id: projectId!,
        goal: finalGoal,
        llm_chat: llmInstructions,
        vocabulary: vocabArray,
      });

      toast.success("Versions generated successfully!");
      navigate(`/workspace/${projectId}`);
    } catch (error: any) {
      console.error("Error generating versions:", error);
      toast.error("Failed to generate versions");
    } finally {
      setGenerating(false);
    }
  };

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-5xl py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="max-w-lg text-3xl font-bold border-none shadow-none focus-visible:ring-1 p-0 h-auto"
                placeholder="Project title..."
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveTitle}
                disabled={savingTitle || projectTitle === project?.title || !projectTitle.trim()}
              >
                {savingTitle ? "Saving..." : "Save"}
              </Button>
            </div>
            <Link to={`/workspace/${projectId}`}>
              <Button variant="ghost" size="sm">
                Skip & Open Editor <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <p className="text-muted-foreground">
            Add reference materials to generate your first draft
          </p>
        </div>

        {/* Progress Summary */}
        {totalJobs > 0 && (
          <Card className="p-4 mb-6 bg-muted/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {completedJobs} of {totalJobs} extractions complete
                </p>
                {activeJobs > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {activeJobs} in progress...
                  </p>
                )}
              </div>
              {allJobsComplete && (
                <Button
                  onClick={handleGenerateVersions}
                  disabled={generating}
                  size="sm"
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Drafts
                    </>
                  )}
                </Button>
              )}
            </div>
          </Card>
        )}

        <div className="grid gap-6">
          {/* File Uploader */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Upload Reference Files</h2>
            <ReferenceUploader
              projectId={projectId!}
              onUploadComplete={invalidateJobs}
            />
          </div>

          {/* YouTube Link */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Add YouTube Video</h2>
            <div className="flex gap-2">
              <Input
                placeholder="Paste YouTube URL..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddYouTube()}
              />
              <Button onClick={handleAddYouTube} disabled={!youtubeUrl.trim()}>
                <Youtube className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          {/* External URL */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Add External Article</h2>
            <div className="flex gap-2">
              <Input
                placeholder="Paste article URL..."
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddURL()}
              />
              <Button onClick={handleAddURL} disabled={!externalUrl.trim()}>
                <LinkIcon className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          <Separator />

          {/* Output Goal */}
          <div>
            <Label className="text-base font-semibold mb-3 block">
              What do you want to generate?
            </Label>
            <RadioGroup value={goal} onValueChange={setGoal}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="substack_article" id="substack" />
                <Label htmlFor="substack">Substack Article</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="email" id="email" />
                <Label htmlFor="email">Email</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="report" id="report" />
                <Label htmlFor="report">Report</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="research_summary" id="research" />
                <Label htmlFor="research">Research Summary</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="other" />
                <Label htmlFor="other">Other</Label>
              </div>
            </RadioGroup>
            {goal === "other" && (
              <Input
                placeholder="Describe what you want to generate..."
                value={customGoal}
                onChange={(e) => setCustomGoal(e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          {/* Vocabulary */}
          <div>
            <Label htmlFor="vocabulary" className="text-base font-semibold mb-2 block">
              Vocabulary / Terms to Enforce (Optional)
            </Label>
            <Textarea
              id="vocabulary"
              placeholder="Enter important terms, one per line. E.g.:&#10;AI → Artificial Intelligence&#10;ML → Machine Learning&#10;UX → User Experience"
              value={vocabulary}
              onChange={(e) => setVocabulary(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Add key terms you want the AI to use consistently in generated drafts
            </p>
          </div>

          {/* LLM Instructions */}
          <div>
            <Label htmlFor="instructions" className="text-base font-semibold mb-2 block">
              Additional Instructions (Optional)
            </Label>
            <Textarea
              id="instructions"
              placeholder="E.g., Use a casual tone, prioritize statistics from source 2, include image 1 as an intro quote..."
              value={llmInstructions}
              onChange={(e) => setLlmInstructions(e.target.value)}
              rows={4}
            />
          </div>

          <Separator />

          {/* Reference Files Status */}
          {referenceFiles.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Reference Files</h2>
              <div className="space-y-3">
                {referenceFiles.map((file) => (
                  <JobStatusCard
                    key={file.id}
                    file={file}
                    onDelete={handleDeleteFile}
                    onRetry={handleRetry}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
