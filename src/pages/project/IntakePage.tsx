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
  Sparkles,
  FileText,
  Trash2
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
  const [rawTextReferences, setRawTextReferences] = useState<Array<{ id: string; text: string; title: string }>>([]);
  const [currentRawText, setCurrentRawText] = useState("");
  const [showExtractedDraft, setShowExtractedDraft] = useState(false);
  const [extractedDraft, setExtractedDraft] = useState("");
  const [referenceNotes, setReferenceNotes] = useState<Record<string, string>>({});
  const [generatedDraft, setGeneratedDraft] = useState("");
  const [draftGenerated, setDraftGenerated] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [saving, setSaving] = useState(false);

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

  // Load reference notes from reference files
  useEffect(() => {
    if (referenceFiles && referenceFiles.length > 0) {
      const notes: Record<string, string> = {};
      referenceFiles.forEach(file => {
        if (file.user_notes) {
          notes[file.id] = file.user_notes;
        }
      });
      if (Object.keys(notes).length > 0) {
        setReferenceNotes(prev => ({ ...prev, ...notes }));
      }
    }
  }, [referenceFiles]);

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

      // Load raw text references if they exist
      if (metadata?.raw_text_references) {
        setRawTextReferences(metadata.raw_text_references);
      }

      // Load extracted draft from metadata if it exists
      if (metadata?.extracted_draft) {
        setExtractedDraft(metadata.extracted_draft);
        setShowExtractedDraft(true);
      }

      // Load saved goal and instructions
      if (metadata?.goal) {
        setGoal(metadata.goal);
      }
      if (metadata?.llm_instructions) {
        setLlmInstructions(metadata.llm_instructions);
      }

      // Load the latest generated draft from versions
      const { data: versions } = await supabase
        .from("versions")
        .select("*")
        .eq("project_id", projectId)
        .ilike("title", "%Generated Draft%")
        .order("created_at", { ascending: false })
        .limit(1);

      if (versions && versions.length > 0) {
        // Convert HTML back to plain text for editing
        const htmlContent = versions[0].content;
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = htmlContent;
        const plainText = tempDiv.textContent || tempDiv.innerText || "";
        
        setGeneratedDraft(plainText);
        setDraftGenerated(true);
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

  const getGoalInstructions = (goalType: string, customGoalText?: string) => {
    const instructions: Record<string, string> = {
      substack_article: "You are a spiritual content publisher who publishes newsletter on Substack. Please write down the substack article using below reference text. The substack article should be with emojis, separators, and a header banner. Each reference article has instructions and context around the file.",
      linkedin_post: "You are a professional content creator. Please write a LinkedIn post using the below reference text. The post should be engaging, professional, and optimized for LinkedIn's algorithm with relevant hashtags and line breaks for readability. Each reference article has instructions and context around the file.",
      twitter_thread: "You are a social media content creator. Please write a Twitter thread using the below reference text. The thread should be engaging, concise, and formatted with proper numbering and emojis. Each tweet should be under 280 characters. Each reference article has instructions and context around the file.",
      blog_post: "You are a professional blogger. Please write a comprehensive blog post using the below reference text. The blog post should have a clear structure with headings, subheadings, and engaging content. Each reference article has instructions and context around the file.",
      email_newsletter: "You are an email marketing specialist. Please write an email newsletter using the below reference text. The email should have an attention-grabbing subject line, engaging content, and clear call-to-action. Each reference article has instructions and context around the file.",
      custom: customGoalText ? `Please create content based on the following instructions: ${customGoalText}. Use the below reference text. Each reference article has instructions and context around the file.` : "Please create content using the below reference text. Each reference article has instructions and context around the file.",
    };
    
    return instructions[goalType] || instructions.custom;
  };

  const handleExtractAndShowDraft = async () => {
    if (totalJobs === 0 && rawTextReferences.length === 0) {
      toast.error("Please add at least one reference");
      return;
    }

    if (!allJobsComplete && totalJobs > 0) {
      toast.error("Please wait for all extractions to complete");
      return;
    }

    setGenerating(true);
    try {
      // Get LLM instructions based on goal
      const llmInstruction = getGoalInstructions(goal, customGoal);
      
      // Start with LLM instructions
      let consolidatedText = llmInstruction + "\n\n--- REFERENCE TEXT BELOW ---\n";

      // Add extracted text from files
      referenceFiles.forEach((file) => {
        if (file.extracted_text) {
          consolidatedText += `\n\n=== BEGIN SOURCE: ${file.file_name || "Unnamed"} ===\n`;
          if (referenceNotes[file.id]) {
            consolidatedText += `[User Context: ${referenceNotes[file.id]}]\n\n`;
          }
          consolidatedText += file.extracted_text;
          consolidatedText += `\n=== END SOURCE: ${file.file_name || "Unnamed"} ===`;
        }
      });

      // Add raw text references
      rawTextReferences.forEach((ref) => {
        consolidatedText += `\n\n=== BEGIN SOURCE: ${ref.title} ===\n`;
        if (referenceNotes[ref.id]) {
          consolidatedText += `[User Context: ${referenceNotes[ref.id]}]\n\n`;
        }
        consolidatedText += ref.text;
        consolidatedText += `\n=== END SOURCE: ${ref.title} ===`;
      });

      setExtractedDraft(consolidatedText.trim());
      setShowExtractedDraft(true);
      toast.success("Draft extracted! Review and edit below.");
    } catch (error: any) {
      console.error("Error extracting draft:", error);
      toast.error("Failed to extract draft");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateVersions = async () => {
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const finalGoal = goal === "other" ? customGoal : goal;
      
      // Parse vocabulary into array
      const vocabArray = vocabulary
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      // Save reference notes
      for (const [fileId, notes] of Object.entries(referenceNotes)) {
        if (notes.trim()) {
          await supabase
            .from("reference_files")
            .update({ user_notes: notes })
            .eq("id", fileId);
        }
      }
      
      // Update project metadata
      const metadata = {
        ...(project.metadata || {}),
        intake_completed: true,
        vocabulary: vocabArray,
        raw_text_references: rawTextReferences,
        extracted_draft: extractedDraft,
        goal: finalGoal,
        llm_instructions: llmInstructions,
      };

      await supabase
        .from("projects")
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq("id", projectId);

      // Generate draft using AI
      const promptToUse = customInstructions.trim() 
        ? `${customInstructions}\n\n${extractedDraft}`
        : extractedDraft;

      const response = await supabase.functions.invoke("gemini-ai", {
        body: {
          action: "generate_draft",
          prompt: promptToUse,
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

  // Convert plain text to HTML with proper formatting
  const convertTextToHTML = (text: string): string => {
    if (!text) return "<p></p>";
    
    // Split by double line breaks for paragraphs
    const paragraphs = text.split(/\n\n+/);
    
    return paragraphs
      .map(para => {
        // Replace single line breaks with <br> tags within paragraphs
        const formattedPara = para
          .trim()
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('<br>');
        
        return formattedPara ? `<p>${formattedPara}</p>` : '';
      })
      .filter(p => p.length > 0)
      .join('');
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

      // Convert both drafts to HTML
      const rawTextHTML = convertTextToHTML(extractedDraft);
      const generatedDraftHTML = convertTextToHTML(generatedDraft);

      // Create two versions: raw consolidated text and generated draft
      const versionsToInsert = [];

      // Version 1: Consolidated raw extracted text
      if (extractedDraft && extractedDraft.trim()) {
        versionsToInsert.push({
          project_id: projectId,
          content: rawTextHTML,
          version_number: nextVersionNumber,
          created_by: user.id,
          title: `Consolidated Raw Text v${nextVersionNumber}`,
          description: "Extracted and consolidated text from all reference files",
        });
      }

      // Version 2: Generated draft
      if (generatedDraft && generatedDraft.trim()) {
        versionsToInsert.push({
          project_id: projectId,
          content: generatedDraftHTML,
          version_number: nextVersionNumber + 1,
          created_by: user.id,
          title: `Generated Draft v${nextVersionNumber + 1}`,
          description: "AI-generated draft from reference intake",
        });
      }

      if (versionsToInsert.length === 0) {
        toast.error("No content to save");
        return;
      }

      const { error } = await supabase
        .from("versions")
        .insert(versionsToInsert);

      if (error) throw error;

      toast.success(`${versionsToInsert.length} version(s) saved successfully!`);
      navigate(`/workspace/${projectId}`);
    } catch (error: any) {
      console.error("Error saving version:", error);
      toast.error("Failed to save version");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRawText = () => {
    if (!currentRawText.trim()) {
      toast.error("Please enter some text first");
      return;
    }

    const newRef = {
      id: crypto.randomUUID(),
      text: currentRawText,
      title: `Raw Text ${rawTextReferences.length + 1}`,
    };
    
    setRawTextReferences([...rawTextReferences, newRef]);
    setCurrentRawText("");
    toast.success("Raw text reference added");
  };

  const handleDeleteRawText = (id: string) => {
    setRawTextReferences(rawTextReferences.filter((ref) => ref.id !== id));
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

          {/* Raw Text References */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Add Raw Text Reference</h2>
            <Textarea
              placeholder="Paste or type your reference text here..."
              value={currentRawText}
              onChange={(e) => setCurrentRawText(e.target.value)}
              rows={6}
              className="mb-2"
            />
            <Button onClick={handleAddRawText} disabled={!currentRawText.trim()}>
              Add
            </Button>
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
          {(referenceFiles.length > 0 || rawTextReferences.length > 0) && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Reference Files</h2>
              <div className="space-y-3">
                {/* Uploaded Files */}
                {referenceFiles.map((file) => (
                  <div key={file.id}>
                    <JobStatusCard
                      file={file}
                      onDelete={handleDeleteFile}
                      onRetry={handleRetry}
                    />
                    <div className="mt-2 pl-11">
                      <Textarea
                        placeholder="Add notes about this reference (what it contains, which parts matter, why it's included...)"
                        value={referenceNotes[file.id] || ""}
                        onChange={(e) =>
                          setReferenceNotes({ ...referenceNotes, [file.id]: e.target.value })
                        }
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))}
                
                {/* Raw Text References */}
                {rawTextReferences.map((ref) => (
                  <div key={ref.id}>
                    <Card className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="text-muted-foreground mt-1 flex-shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium truncate">
                                {ref.title}
                              </h4>
                            </div>
                          </div>
                          
                          <p className="text-xs text-muted-foreground line-clamp-3 mb-2 break-words">
                            {ref.text.slice(0, 150)}...
                          </p>

                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteRawText(ref.id)}
                              className="h-7 text-xs px-2 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                    <div className="mt-2 pl-11">
                      <Textarea
                        placeholder="Add notes about this reference (what it contains, which parts matter, why it's included...)"
                        value={referenceNotes[ref.id] || ""}
                        onChange={(e) =>
                          setReferenceNotes({ ...referenceNotes, [ref.id]: e.target.value })
                        }
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generate Drafts Button at Bottom */}
          {(totalJobs > 0 || rawTextReferences.length > 0) && (
            <div className="mt-8 pt-6 border-t">
              <Button
                onClick={handleExtractAndShowDraft}
                disabled={generating || (!allJobsComplete && totalJobs > 0)}
                size="lg"
                className="w-full"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Extracting Draft...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Extract & Show Draft
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                This will combine all references into an editable draft
              </p>
            </div>
          )}

          {/* Extracted Draft View */}
          {showExtractedDraft && (
            <div className="mt-8 pt-6 border-t">
              <h2 className="text-xl font-semibold mb-3">Raw Extracted Draft (Editable)</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Review and edit the extracted content before generating versions.
              </p>
              <Textarea
                value={extractedDraft}
                onChange={(e) => setExtractedDraft(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
              <div className="mt-4 flex gap-3">
                <Button
                  onClick={handleGenerateVersions}
                  disabled={generating}
                  size="lg"
                  className="flex-1"
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Generating Versions...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-5 w-5" />
                      Generate Versions
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => setShowExtractedDraft(false)}
                  variant="outline"
                  size="lg"
                >
                  Hide Draft
                </Button>
              </div>
            </div>
          )}

          {/* Generated Draft Section */}
          {draftGenerated && (
            <div className="mt-8 pt-6 border-t">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">Generated Draft</h2>
                <div className="flex items-center gap-2 text-green-600">
                  <Sparkles className="h-5 w-5" />
                  <span className="text-sm font-medium">Draft Generated</span>
                </div>
              </div>
              <Textarea
                value={generatedDraft}
                onChange={(e) => setGeneratedDraft(e.target.value)}
                rows={25}
                className="font-mono text-sm mb-4"
              />
              
              {/* Custom Instructions for Regeneration */}
              <div className="mb-4">
                <Label htmlFor="customInstructions" className="text-sm font-medium mb-2 block">
                  Custom Instructions (Optional - for regeneration)
                </Label>
                <Textarea
                  id="customInstructions"
                  placeholder="Add any specific instructions for regenerating the draft..."
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
              </div>

              <div className="flex gap-3">
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
                  onClick={handleGenerateVersions}
                  variant="outline"
                  size="lg"
                  disabled={generating}
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    "Regenerate"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
