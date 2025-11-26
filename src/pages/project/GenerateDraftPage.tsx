import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Sparkles, Check } from "lucide-react";

export default function GenerateDraftPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extractedDraft, setExtractedDraft] = useState("");
  const [generatedDraft, setGeneratedDraft] = useState("");
  const [draftGenerated, setDraftGenerated] = useState(false);

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
      
      // Load extracted draft from metadata
      const metadata = data.metadata as any;
      if (metadata?.extracted_draft) {
        setExtractedDraft(metadata.extracted_draft);
      } else {
        toast.error("No draft found. Please go back and extract a draft first.");
        navigate(`/project/${projectId}/intake`);
      }
    } catch (error: any) {
      console.error("Error loading project:", error);
      toast.error("Failed to load project");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDraft = async () => {
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const response = await supabase.functions.invoke("gemini-ai", {
        body: {
          action: "generate_draft",
          prompt: extractedDraft,
        },
      });

      if (response.error) throw response.error;
      
      setGeneratedDraft(response.data.text || "");
      setDraftGenerated(true);
      toast.success("Draft generated successfully!");
    } catch (error: any) {
      console.error("Error generating draft:", error);
      toast.error("Failed to generate draft");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveVersion = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Get the next version number
      const { data: existingVersions } = await supabase
        .from("versions")
        .select("version_number")
        .eq("project_id", projectId)
        .order("version_number", { ascending: false })
        .limit(1);

      const nextVersionNumber = existingVersions && existingVersions.length > 0
        ? existingVersions[0].version_number + 1
        : 1;

      // Create new version
      const { error } = await supabase
        .from("versions")
        .insert({
          project_id: projectId,
          content: generatedDraft,
          version_number: nextVersionNumber,
          created_by: user.id,
          title: `Draft v${nextVersionNumber}`,
          description: "Generated from reference intake",
        });

      if (error) throw error;

      toast.success("Draft saved as version!");
      navigate(`/workspace/${projectId}`);
    } catch (error: any) {
      console.error("Error saving version:", error);
      toast.error("Failed to save version");
    } finally {
      setSaving(false);
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
            <div>
              <h1 className="text-3xl font-bold">{project?.title}</h1>
              <p className="text-muted-foreground mt-1">Generate Draft</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/project/${projectId}/intake`)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Intake
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Instructions */}
          <Card className="p-6 bg-muted/50">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h3 className="font-semibold mb-1">Ready to Generate</h3>
                <p className="text-sm text-muted-foreground">
                  Click the button below to generate your draft based on the reference materials and instructions you provided.
                </p>
              </div>
            </div>
          </Card>

          {/* Generate Button */}
          {!draftGenerated && (
            <div className="flex justify-center">
              <Button
                onClick={handleGenerateDraft}
                disabled={generating}
                size="lg"
                className="min-w-[200px]"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Generate Draft
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Generated Draft */}
          {draftGenerated && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold">Generated Draft</h2>
                <div className="flex items-center gap-2 text-green-600">
                  <Check className="h-5 w-5" />
                  <span className="text-sm font-medium">Draft Generated</span>
                </div>
              </div>
              <Textarea
                value={generatedDraft}
                onChange={(e) => setGeneratedDraft(e.target.value)}
                rows={25}
                className="font-mono text-sm"
              />
              <div className="mt-4 flex gap-3">
                <Button
                  onClick={handleSaveVersion}
                  disabled={saving}
                  size="lg"
                  className="flex-1"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save & Go to Workspace"
                  )}
                </Button>
                <Button
                  onClick={handleGenerateDraft}
                  variant="outline"
                  size="lg"
                  disabled={generating}
                >
                  Regenerate
                </Button>
              </div>
            </div>
          )}

          {/* Source Prompt (Collapsible) */}
          {extractedDraft && (
            <details className="mt-8">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                View Source Prompt (Click to expand)
              </summary>
              <Textarea
                value={extractedDraft}
                readOnly
                rows={15}
                className="font-mono text-xs mt-3 bg-muted"
              />
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
