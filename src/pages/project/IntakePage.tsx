import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ReferenceUploader } from "@/components/upload/ReferenceUploader";
import { JobStatusCard } from "@/components/ui/JobStatusCard";
import { useExtractionJobs } from "@/hooks/useExtractionJobs";
import { intakeAPI } from "@/lib/api/intake";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, Youtube, Link as LinkIcon, Sparkles, FileText, Trash2 } from "lucide-react";

export default function IntakePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [goal, setGoal] = useState("substack_article");
  const [customGoal, setCustomGoal] = useState("");
  const [language, setLanguage] = useState("english");
  const [llmInstructions, setLlmInstructions] = useState("");
  const [vocabulary, setVocabulary] = useState("");
  const [projectTitle, setProjectTitle] = useState(() => {
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    return `New Project - ${today}`;
  });
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
      referenceFiles.forEach((file) => {
        if (file.user_notes) {
          notes[file.id] = file.user_notes;
        }
      });
      if (Object.keys(notes).length > 0) {
        setReferenceNotes((prev) => ({ ...prev, ...notes }));
      }
    }
  }, [referenceFiles]);

  const loadProject = async () => {
    try {
      const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).single();

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

      // Load reference notes for raw text references from metadata
      if (metadata?.reference_notes) {
        setReferenceNotes((prev) => ({ ...prev, ...metadata.reference_notes }));
      }

      // Load extracted draft from metadata if it exists
      if (metadata?.extracted_draft) {
        setExtractedDraft(metadata.extracted_draft);
        setShowExtractedDraft(true);
      }

      // Load saved goal, language, and instructions
      if (metadata?.goal) {
        setGoal(metadata.goal);
      }
      if (metadata?.language) {
        setLanguage(metadata.language);
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

  const getGoalInstructions = (goalType: string, customGoalText?: string, targetLanguage?: string) => {
    const instructions: Record<string, string> = {
      substack_newsletter: `You are a content publisher who writes newsletters on Substack, with a focus on moral values, and peace.

Your task is to compose a Substack newsletter using the provided reference text. Follow these guidelines carefully:

✨ Newsletter Requirements
Include emojis, separators, and a header banner for visual appeal.

The newsletter must be authored under the name: Mr. Sanjiv Kumar.

You may reference the grandfather of Mr. Sanjiv Kumar, to enrich the context.

You may also reference scientific studies or facts that support or relate to the overall message.

Each reference text provided will come with explicit instructions and context. You must strictly obey those instructions.

📑 Structure & Formatting
Maintain proper spacing between different parts of the newsletter.

Keep paragraphs short and concise (avoid long blocks of text).

Divide the newsletter into clear sections with proper titles.

In each section, include three short paragraphs:

Research – a fact, study, or evidence.

Reflection – a personal or practical takeaway.

🌸 Closing
End the newsletter with the following signature line:

With light, love and peace,  
Sanjiv Kumar`,
      wordpress_blog:
        "You are a professional blogger. Please write a comprehensive WordPress blog post using the below reference text. The blog post should have a clear structure with headings, subheadings, and engaging content. Each reference article has instructions and context around the file.",
      note: "Please create a concise and organized note using the below reference text. The note should capture key points and important information in a clear format. Each reference article has instructions and context around the file.",
      book_article:
        "You are an author writing an article for a book. Please write a well-structured article using the below reference text. The article should have depth, proper citations, and flow well within a book chapter format. Each reference article has instructions and context around the file.",
      story_children:
        "You are a children's book author. Please write an engaging story for small children using the below reference text. The story should be simple, fun, educational, and age-appropriate with clear language and vivid imagery. Each reference article has instructions and context around the file.",
      story_adults:
        "You are a fiction author. Please write an engaging story for adults using the below reference text. The story should have compelling characters, plot development, and sophisticated narrative techniques. Each reference article has instructions and context around the file.",
      other: customGoalText
        ? `Please create content based on the following instructions: ${customGoalText}. Use the below reference text. Each reference article has instructions and context around the file.`
        : "Please create content using the below reference text. Each reference article has instructions and context around the file.",
    };

    let instruction = instructions[goalType] || instructions.other;
    
    // Add language instruction if not English
    if (targetLanguage && targetLanguage !== "english") {
      const languageNames: Record<string, string> = {
        hindi: "Hindi",
        tamil: "Tamil",
        german: "German"
      };
      const languageName = languageNames[targetLanguage] || targetLanguage;
      instruction += `\n\n**CRITICAL REQUIREMENT**: The entire content MUST be written in ${languageName}. Generate the complete output in ${languageName} language.`;
    }

    return instruction;
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
      // Get LLM instructions based on goal and language
      const llmInstruction = getGoalInstructions(goal, customGoal, language);

      // Start with LLM instructions
      let consolidatedText = llmInstruction + "\n\n--- REFERENCE TEXT BELOW ---\n";

      // Add extracted text from files
      referenceFiles.forEach((file) => {
        if (file.extracted_text) {
          consolidatedText += `\n\n=== BEGIN SOURCE: ${file.file_name || "Unnamed"} ===\n`;
          if (referenceNotes[file.id]) {
            consolidatedText += `[Instructions on how to use this text: ${referenceNotes[file.id]}]\n\n`;
          }
          consolidatedText += file.extracted_text;
          consolidatedText += `\n=== END SOURCE: ${file.file_name || "Unnamed"} ===`;
        }
      });

      // Add raw text references
      rawTextReferences.forEach((ref) => {
        consolidatedText += `\n\n=== BEGIN SOURCE: ${ref.title} ===\n`;
        if (referenceNotes[ref.id]) {
          consolidatedText += `[Instructions on how to use this text: ${referenceNotes[ref.id]}]\n\n`;
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const finalGoal = goal === "other" ? customGoal : goal;

      // Parse vocabulary into array
      const vocabArray = vocabulary
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // Save reference notes for files to the database
      for (const [fileId, notes] of Object.entries(referenceNotes)) {
        // Only update if it's an actual file (exists in referenceFiles)
        const isFile = referenceFiles.some((f) => f.id === fileId);
        if (isFile && notes.trim()) {
          await supabase.from("reference_files").update({ user_notes: notes }).eq("id", fileId);
        }
      }

      // Save reference notes for raw text references to metadata
      const rawTextNotes: Record<string, string> = {};
      rawTextReferences.forEach((ref) => {
        if (referenceNotes[ref.id]) {
          rawTextNotes[ref.id] = referenceNotes[ref.id];
        }
      });

      // Update project metadata
      const metadata = {
        ...(project.metadata || {}),
        intake_completed: true,
        vocabulary: vocabArray,
        raw_text_references: rawTextReferences,
        reference_notes: rawTextNotes,
        extracted_draft: extractedDraft,
        goal: finalGoal,
        language: language,
        llm_instructions: llmInstructions,
      };

      await supabase.from("projects").update({ metadata, updated_at: new Date().toISOString() }).eq("id", projectId);

      // Rebuild the prompt with CURRENT goal instructions and language (not the old ones baked into extractedDraft)
      const currentGoalInstructions = getGoalInstructions(goal, customGoal, language);
      
      // Extract just the reference text from extractedDraft (remove old instructions)
      let referenceTextOnly = extractedDraft;
      const referenceMarker = "--- REFERENCE TEXT BELOW ---";
      if (extractedDraft.includes(referenceMarker)) {
        referenceTextOnly = extractedDraft.split(referenceMarker)[1] || extractedDraft;
      }
      
      // Build fresh prompt with current goal instructions
      let freshPrompt = currentGoalInstructions + "\n\n--- REFERENCE TEXT BELOW ---\n" + referenceTextOnly;
      
      // Add custom instructions if provided
      const promptToUse = customInstructions.trim() ? `${customInstructions}\n\n${freshPrompt}` : freshPrompt;

      console.log("=== FULL PROMPT BEING SENT TO GEMINI ===");
      console.log("Selected Goal:", goal);
      console.log("Prompt length:", promptToUse.length, "characters");
      console.log("First 500 chars:", promptToUse.substring(0, 500));
      console.log("=========================================");

      const response = await supabase.functions.invoke("gemini-ai", {
        body: {
          action: "generate_draft",
          prompt: promptToUse,
        },
      });

      if (response.error) throw response.error;

      if (response.data?.error) {
        console.error("Gemini AI blocked or failed:", response.data);
        const blockReason = (response.data as any).blockReason as string | undefined;
        const promptPreview = (response.data as any).promptPreview as string | undefined;
        const geminiDetails = (response.data as any).gemini as any | undefined;

        let errorMsg = response.data.error as string;
        if (blockReason) {
          errorMsg = `Gemini blocked this request (${blockReason}). This message comes directly from Gemini's safety system, not from your app.`;
        }

        const debugParts: string[] = [];
        if (blockReason) debugParts.push(`Block reason: ${blockReason}`);
        if (promptPreview) debugParts.push(`Prompt preview (first part sent to Gemini):\n${promptPreview}`);
        if (geminiDetails?.promptFeedback) {
          debugParts.push(`Prompt feedback from Gemini:\n${JSON.stringify(geminiDetails.promptFeedback, null, 2)}`);
        }

        const fullMessage = debugParts.length > 0 ? `${errorMsg}\n\n${debugParts.join("\n\n")}` : errorMsg;

        toast.error(fullMessage, { duration: 12000 });
        console.log("Gemini debug payload (for developer inspection):", response.data);
        return;
      }

      setGeneratedDraft(response.data?.text || "");
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
      .map((para) => {
        // Replace single line breaks with <br> tags within paragraphs
        const formattedPara = para
          .trim()
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .join("<br>");

        return formattedPara ? `<p>${formattedPara}</p>` : "";
      })
      .filter((p) => p.length > 0)
      .join("");
  };

  const handleSaveVersion = async () => {
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Get the next version number
      const { data: existingVersions } = await supabase
        .from("versions")
        .select("version_number")
        .eq("project_id", projectId)
        .order("version_number", { ascending: false })
        .limit(1);

      const nextVersionNumber =
        existingVersions && existingVersions.length > 0 ? existingVersions[0].version_number + 1 : 1;

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

      const { error } = await supabase.from("versions").insert(versionsToInsert);

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
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </div>
          
          <h2 className="text-lg font-semibold mb-3">Name Your Project</h2>
          <div className="flex items-center gap-2 mb-6">
            <Input
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              className="flex-1 text-lg font-medium"
              placeholder="Project title..."
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveTitle}
              disabled={savingTitle || projectTitle === project?.title || !projectTitle.trim()}
            >
              {savingTitle ? "Saving..." : "Save"}
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate(`/workspace/${projectId}`)}
            >
              Skip & Open Editor <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Output Goal */}
          <div className="mb-6">
            <Label className="text-base font-semibold mb-3 block">What do you want to generate?</Label>
            <RadioGroup value={goal} onValueChange={setGoal}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="substack_newsletter" id="substack" />
                <Label htmlFor="substack">Substack newsletter</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="wordpress_blog" id="wordpress" />
                <Label htmlFor="wordpress">Wordpress Blog</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="note" id="note" />
                <Label htmlFor="note">Note</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="book_article" id="book" />
                <Label htmlFor="book">Article for a book</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="story_children" id="children" />
                <Label htmlFor="children">Story for small children</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="story_adults" id="adults" />
                <Label htmlFor="adults">Story for adults</Label>
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

          {/* Language Selection */}
          <div className="mb-6">
            <Label className="text-base font-semibold mb-2 block">
              Output Language
            </Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="english">English</SelectItem>
                <SelectItem value="hindi">Hindi</SelectItem>
                <SelectItem value="tamil">Tamil</SelectItem>
                <SelectItem value="german">German</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              The generated version will be in the selected language
            </p>
          </div>

          <Separator className="my-6" />

          {/* Raw Text References */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Add Reference Text</h2>
            <Textarea
              placeholder="Paste or type your reference text here..."
              value={currentRawText}
              onChange={(e) => setCurrentRawText(e.target.value)}
              rows={4}
              className="mb-2"
            />
            <Button onClick={handleAddRawText} disabled={!currentRawText.trim()}>
              Add
            </Button>
          </div>
        </div>

        {/* Progress Summary */}
        {totalJobs > 0 && (
          <Card className="p-4 mb-6 bg-muted/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {completedJobs} of {totalJobs} extractions complete
                </p>
                {activeJobs > 0 && <p className="text-xs text-muted-foreground">{activeJobs} in progress...</p>}
              </div>
            </div>
          </Card>
        )}

        <div className="grid gap-6">
          {/* File Uploader */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Upload Reference Files</h2>
            <ReferenceUploader projectId={projectId!} onUploadComplete={invalidateJobs} />
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
                    <JobStatusCard file={file} onDelete={handleDeleteFile} onRetry={handleRetry} />
                    <div className="mt-2 pl-11">
                      <Textarea
                        placeholder="Add instructions on how to use this reference"
                        value={referenceNotes[file.id] || ""}
                        onChange={(e) => setReferenceNotes({ ...referenceNotes, [file.id]: e.target.value })}
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
                              <h4 className="text-sm font-medium truncate">{ref.title}</h4>
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
                        placeholder="Add instructions on how to use this reference"
                        value={referenceNotes[ref.id] || ""}
                        onChange={(e) => setReferenceNotes({ ...referenceNotes, [ref.id]: e.target.value })}
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
              <div className="bg-muted/50 border border-border rounded-lg p-3 mb-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> This draft includes goal-based instructions at the top (based on your selected
                  goal: <strong>{goal === "other" ? customGoal : goal.replace(/_/g, " ")}</strong>). You can edit or
                  remove these instructions if they cause AI generation issues. Your edits will be used when you click
                  "Generate Versions".
                </p>
              </div>
              <Textarea
                value={extractedDraft}
                onChange={(e) => setExtractedDraft(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
              <div className="mt-4 flex gap-3">
                <Button onClick={handleGenerateVersions} disabled={generating} size="lg" className="flex-1">
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
                <Button onClick={() => setShowExtractedDraft(false)} variant="outline" size="lg">
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
                <Button onClick={handleSaveVersion} disabled={saving} size="lg" className="flex-1">
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save & Go to Workspace"
                  )}
                </Button>
                <Button onClick={handleGenerateVersions} variant="outline" size="lg" disabled={generating}>
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
