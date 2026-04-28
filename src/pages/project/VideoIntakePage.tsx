import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { JobStatusCard } from "@/components/ui/JobStatusCard";
import { useExtractionJobs } from "@/hooks/useExtractionJobs";
import { intakeAPI } from "@/lib/api/intake";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PageNavigationBanner from "@/components/ui/PageNavigationBanner";
import {
  Loader2,
  Sparkles,
  FileVideo,
  Eye,
  Code,
  Plus,
} from "lucide-react";
import { GoogleDrivePickerDialog } from "@/components/upload/GoogleDrivePickerDialog";

const VIDEO_PROMPT = `You are an expert short-form video scriptwriter. Based on the provided video reference(s), create a punchy, engaging YouTube Shorts script (under 60 seconds, ~150 words max). Include: a strong 3-second hook, a tight narrative or insight from the source video, on-screen text suggestions in [brackets], suggested b-roll/cut points, and a clear CTA at the end. Keep language simple, energetic, and optimized for vertical video.`;

export default function VideoIntakePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState("english");
  const [selectedModel, setSelectedModel] = useState("gpt-5");
  const [projectTitle, setProjectTitle] = useState(() => {
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    return `New Video Project - ${today}`;
  });
  const [savingTitle, setSavingTitle] = useState(false);
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showExtractedDraft, setShowExtractedDraft] = useState(false);
  const [extractedDraft, setExtractedDraft] = useState("");
  const [referenceNotes, setReferenceNotes] = useState<Record<string, string>>({});
  const [generatedDraft, setGeneratedDraft] = useState(() => projectId ? localStorage.getItem(`draft_${projectId}`) || "" : "");
  const [draftGenerated, setDraftGenerated] = useState(() => projectId ? !!localStorage.getItem(`draft_${projectId}`) : false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState("General");
  const [themes, setThemes] = useState<Array<{ id: string; name: string }>>([]);
  const [showAddTheme, setShowAddTheme] = useState(false);
  const [newThemeName, setNewThemeName] = useState("");
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [usedModel, setUsedModel] = useState<string | null>(() => projectId ? localStorage.getItem(`draft_model_${projectId}`) : null);

  const {
    referenceFiles,
    allJobsComplete,
    totalJobs,
    completedJobs,
    activeJobs,
    invalidateJobs,
  } = useExtractionJobs(projectId);

  useEffect(() => {
    loadProject();
    fetchThemes();
  }, [projectId]);

  useEffect(() => {
    if (projectId && generatedDraft) localStorage.setItem(`draft_${projectId}`, generatedDraft);
  }, [projectId, generatedDraft]);

  useEffect(() => {
    if (projectId && usedModel) localStorage.setItem(`draft_model_${projectId}`, usedModel);
  }, [projectId, usedModel]);

  const fetchThemes = async () => {
    try {
      const { data, error } = await supabase.from("themes").select("id, name").order("name", { ascending: true });
      if (error) throw error;
      setThemes(data || []);
    } catch (error) {
      console.error("Error fetching themes:", error);
    }
  };

  const handleAddTheme = async () => {
    if (!newThemeName.trim()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from("themes").insert({ name: newThemeName.trim(), created_by: user.id }).select().single();
      if (error) {
        if (error.code === "23505") toast.error("Theme already exists");
        else throw error;
        return;
      }
      setThemes(prev => [...prev, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTheme(data.name);
      saveThemeToProject(data.name);
      setNewThemeName("");
      setShowAddTheme(false);
      toast.success("Theme added!");
    } catch (error) {
      console.error("Error adding theme:", error);
      toast.error("Failed to add theme");
    }
  };

  const saveThemeToProject = async (themeName: string) => {
    try {
      const currentMetadata = project?.metadata || {};
      await supabase.from("projects").update({ metadata: { ...currentMetadata, theme: themeName }, updated_at: new Date().toISOString() }).eq("id", projectId);
    } catch (error) {
      console.error("Error saving theme:", error);
    }
  };

  const handleThemeChange = (value: string) => {
    if (value === "__add_theme__") { setShowAddTheme(true); return; }
    setSelectedTheme(value);
    saveThemeToProject(value);
  };

  const loadProject = async () => {
    try {
      const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).single();
      if (error) throw error;
      setProject(data);
      setProjectTitle(data.title || "");
      const metadata = data.metadata as any;
      if (metadata?.language) setLanguage(metadata.language);
      if (metadata?.selectedModel) setSelectedModel(metadata.selectedModel);
      if (metadata?.theme) setSelectedTheme(metadata.theme);
      if (metadata?.extracted_draft) {
        setExtractedDraft(metadata.extracted_draft);
        setShowExtractedDraft(true);
      }

      const { data: versions } = await supabase
        .from("versions").select("*").eq("project_id", projectId)
        .ilike("title", "%Generated Draft%")
        .order("created_at", { ascending: false }).limit(1);
      if (versions && versions.length > 0) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = versions[0].content;
        tempDiv.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
        tempDiv.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote").forEach((el) => el.append("\n\n"));
        const plainText = (tempDiv.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
        setGeneratedDraft(plainText);
        setDraftGenerated(true);
      }
    } catch (error) {
      console.error("Error loading project:", error);
      toast.error("Failed to load project");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTitle = useCallback(async (title: string) => {
    if (!title.trim()) return;
    setSavingTitle(true);
    try {
      const { error } = await supabase.from("projects").update({ title, updated_at: new Date().toISOString() }).eq("id", projectId);
      if (error) throw error;
      setProject((prev: any) => ({ ...prev, title }));
    } catch (error) {
      console.error("Title save failed:", error);
      toast.error("Failed to save title");
    } finally {
      setSavingTitle(false);
    }
  }, [projectId]);

  const handleTitleChange = (newTitle: string) => {
    setProjectTitle(newTitle);
    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    titleSaveTimerRef.current = setTimeout(() => handleSaveTitle(newTitle), 800);
  };

  useEffect(() => () => { if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current); }, []);

  const handleDeleteFile = async (fileId: string) => {
    try {
      await intakeAPI.deleteReferenceFile(fileId);
      toast.success("Reference file deleted");
      invalidateJobs();
    } catch (error) {
      console.error("Error deleting file:", error);
      toast.error("Failed to delete file");
    }
  };

  const handleRetry = async (fileId: string) => {
    const file = referenceFiles.find((f) => f.id === fileId);
    if (!file) return;
    try {
      await intakeAPI.queueExtraction({ reference_file_id: fileId, job_type: `${file.file_type}_parse` });
      toast.success("Extraction requeued");
      invalidateJobs();
    } catch (error) {
      console.error("Error retrying extraction:", error);
      toast.error("Failed to retry extraction");
    }
  };

  const buildInstruction = () => {
    const languageNames: Record<string, string> = { english: "English", hindi: "Hindi", tamil: "Tamil", german: "German" };
    const langName = languageNames[language] || "English";
    return `${VIDEO_PROMPT}\n\n**CRITICAL REQUIREMENT**: The entire content MUST be written in ${langName}.`;
  };

  const handleExtractAndShowDraft = async () => {
    if (totalJobs === 0) { toast.error("Please add at least one video reference from Google Drive"); return; }
    if (!allJobsComplete) { toast.error("Please wait for all extractions to complete"); return; }
    setGenerating(true);
    try {
      let consolidatedText = buildInstruction() + "\n\n--- REFERENCE TEXT BELOW ---\n";
      referenceFiles.forEach((file) => {
        if (file.extracted_text) {
          consolidatedText += `\n\n=== BEGIN SOURCE: ${file.file_name || "Unnamed"} ===\n`;
          if (referenceNotes[file.id]) consolidatedText += `[User instructions: ${referenceNotes[file.id]}]\n\n`;
          consolidatedText += file.extracted_text;
          consolidatedText += `\n=== END SOURCE: ${file.file_name || "Unnamed"} ===`;
        }
      });
      setExtractedDraft(consolidatedText.trim());
      setShowExtractedDraft(true);
      toast.success("Draft extracted! Review and edit below.");
    } catch (error) {
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

      for (const [fileId, notes] of Object.entries(referenceNotes)) {
        const isFile = referenceFiles.some((f) => f.id === fileId);
        if (isFile && notes.trim()) {
          await supabase.from("reference_files").update({ user_notes: notes }).eq("id", fileId);
        }
      }

      const metadata = {
        ...(project.metadata || {}),
        intake_completed: true,
        extracted_draft: extractedDraft,
        goal: "video_to_youtube_short",
        language,
        selectedModel,
      };
      await supabase.from("projects").update({ metadata, updated_at: new Date().toISOString() }).eq("id", projectId);

      const referenceMarker = "--- REFERENCE TEXT BELOW ---";
      let referenceTextOnly = extractedDraft;
      if (extractedDraft.includes(referenceMarker)) referenceTextOnly = extractedDraft.split(referenceMarker)[1] || extractedDraft;
      const promptToUse = buildInstruction() + "\n\n--- REFERENCE TEXT BELOW ---\n" + referenceTextOnly;

      const response = await supabase.functions.invoke("gemini-ai", {
        body: { action: "generate_draft", prompt: promptToUse, model: selectedModel, projectId },
      });
      if (response.error) throw response.error;
      if (response.data?.error) {
        toast.error(response.data.error, { duration: 12000 });
        return;
      }
      setGeneratedDraft(response.data?.text || "");
      setDraftGenerated(true);
      setUsedModel(selectedModel);
      toast.success("Draft generated successfully!");
    } catch (error) {
      console.error("Error generating draft:", error);
      toast.error("Failed to generate draft");
    } finally {
      setGenerating(false);
    }
  };

  const convertTextToHTML = (text: string): string => {
    if (!text) return "<p></p>";
    return text.split(/\n\n+/).map((para) => {
      const formatted = para.trim().split("\n").map((l) => l.trim()).filter((l) => l.length > 0).join("<br>");
      return formatted ? `<p>${formatted}</p>` : "";
    }).filter((p) => p.length > 0).join("");
  };

  const handleSaveVersion = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const { data: existingVersions } = await supabase.from("versions").select("version_number").eq("project_id", projectId).order("version_number", { ascending: false }).limit(1);
      const next = existingVersions && existingVersions.length > 0 ? existingVersions[0].version_number + 1 : 1;
      const versionsToInsert: any[] = [];
      if (extractedDraft.trim()) versionsToInsert.push({ project_id: projectId, content: convertTextToHTML(extractedDraft), version_number: next, created_by: user.id, title: `Consolidated Raw Text v${next}`, description: "Extracted text from video references" });
      if (generatedDraft.trim()) versionsToInsert.push({ project_id: projectId, content: convertTextToHTML(generatedDraft), version_number: next + 1, created_by: user.id, title: `Generated Draft v${next + 1}`, description: "AI-generated YouTube Short script" });
      if (versionsToInsert.length === 0) { toast.error("No content to save"); return; }
      const { error } = await supabase.from("versions").insert(versionsToInsert);
      if (error) throw error;
      toast.success(`${versionsToInsert.length} version(s) saved successfully!`);
      navigate(`/workspace/${projectId}`);
    } catch (error) {
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
    <>
      <div className="min-h-screen bg-background ml-14">
        <PageNavigationBanner
          title="New Video Project — Reference Intake"
          leftLabel="Project Dashboard"
          leftPath="/dashboard"
          rightLabel="Edit and refine"
          rightPath={`/workspace/${projectId}`}
        />
        <div className="container max-w-5xl py-8">
          <div className="mb-8">
            {/* Name */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-1">Name Your Project</h2>
              <p className="text-xs text-muted-foreground mb-3">Give your project a descriptive name to easily identify it later</p>
              <div className="flex items-center gap-2">
                <Input value={projectTitle} onChange={(e) => handleTitleChange(e.target.value)} className="flex-1 text-lg font-medium" placeholder="Project title..." />
                {savingTitle && <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>}
              </div>
            </div>

            {/* Theme */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-1">Choose Theme</h2>
              <p className="text-xs text-muted-foreground mb-3">Categorize your project under a theme for easy filtering</p>
              {!showAddTheme ? (
                <Select value={selectedTheme} onValueChange={handleThemeChange}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select a theme" /></SelectTrigger>
                  <SelectContent>
                    {themes.map((t) => (<SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>))}
                    <SelectItem value="__add_theme__"><span className="flex items-center gap-1"><Plus className="h-3 w-3" /> Add Theme</span></SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2">
                  <Input value={newThemeName} onChange={(e) => setNewThemeName(e.target.value)} placeholder="Enter theme name..." className="flex-1" autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddTheme(); if (e.key === "Escape") { setShowAddTheme(false); setNewThemeName(""); } }} />
                  <Button size="sm" onClick={handleAddTheme} disabled={!newThemeName.trim()}>Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowAddTheme(false); setNewThemeName(""); }}>Cancel</Button>
                </div>
              )}
            </div>

            {/* Define Outcome */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Define Outcome</h2>
              <div className="pl-4 space-y-4">
                <div>
                  <Label className="text-base font-semibold mb-2 block">What do you want to generate?</Label>
                  <Select value="video_to_youtube_short" onValueChange={() => {}}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video_to_youtube_short">Video to YouTube Short</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-base font-semibold mb-2 block">What language you want your final content to be in</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="english">English</SelectItem>
                      <SelectItem value="hindi">Hindi</SelectItem>
                      <SelectItem value="tamil">Tamil</SelectItem>
                      <SelectItem value="german">German</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-base font-semibold mb-2 block">Which AI model to use</Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Gemini 2.5 Flash (Default)</SelectItem>
                      <SelectItem value="gemini-3">Gemini 3 Flash (Preview)</SelectItem>
                      <SelectItem value="gpt-5">GPT-5 (Premium)</SelectItem>
                      <SelectItem value="gpt-5.2">GPT-5.2 (Latest)</SelectItem>
                      <SelectItem value="gpt-5-mini">GPT-5 Mini</SelectItem>
                      <SelectItem value="gpt-5-nano">GPT-5 Nano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator className="my-8" />

            {/* Add References */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-2">Add References</h2>
              <p className="text-sm text-muted-foreground mb-6">Select video files from the connected Google Drive to use as source material.</p>

              <div className="pl-4 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold">Add Files</h3>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowDrivePicker(true)}>
                      <FileVideo className="mr-2 h-4 w-4" />
                      Select from Google Drive
                    </Button>
                  </div>
                  <Card className="p-6 border-dashed text-center text-sm text-muted-foreground">
                    Click "Select from Google Drive" above to choose video files.
                  </Card>
                </div>
              </div>
            </div>
          </div>

          {totalJobs > 0 && (
            <Card className="p-4 mb-6 bg-muted/50">
              <p className="text-sm font-medium">{completedJobs} of {totalJobs} extractions complete</p>
              {activeJobs > 0 && <p className="text-xs text-muted-foreground">{activeJobs} in progress...</p>}
            </Card>
          )}

          <div className="grid gap-6">
            <Separator />

            {referenceFiles.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3">Review your video references and add Instructions</h2>
                <div className="space-y-3">
                  {referenceFiles.map((file) => (
                    <div key={file.id}>
                      <JobStatusCard file={file} onDelete={handleDeleteFile} onRetry={handleRetry} />
                      <div className="mt-2 pl-11">
                        <Textarea
                          placeholder='Add instructions on how to use this video. e.g. "Focus on the opening 30 seconds" or "Use the key insight at 2:15"'
                          value={referenceNotes[file.id] || ""}
                          onChange={(e) => setReferenceNotes({ ...referenceNotes, [file.id]: e.target.value })}
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalJobs > 0 && (
              <div className="mt-8 pt-6 border-t">
                <Button onClick={handleExtractAndShowDraft} disabled={generating || !allJobsComplete} size="lg" className="w-full">
                  {generating ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" />Preparing input for AI...</>) : (<><Sparkles className="mr-2 h-5 w-5" />Prepare consolidated input to AI</>)}
                </Button>
              </div>
            )}

            {showExtractedDraft && (
              <div className="mt-8 pt-6 border-t">
                <h2 className="text-xl font-semibold mb-3">Consolidated input to AI (editable)</h2>
                <Textarea value={extractedDraft} onChange={(e) => setExtractedDraft(e.target.value)} rows={20} className="font-mono text-sm" />
                <div className="mt-4 flex gap-3">
                  <Button onClick={handleGenerateVersions} disabled={generating} size="lg" className="flex-1">
                    {generating ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" />Generating Draft...</>) : (<><Sparkles className="mr-2 h-5 w-5" />Ask AI to generate script</>)}
                  </Button>
                  <Button onClick={() => setShowExtractedDraft(false)} variant="outline" size="lg">Hide Draft</Button>
                </div>
              </div>
            )}

            {draftGenerated && (
              <div className="mt-8 pt-6 border-t">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-semibold">Generated YouTube Short Script</h2>
                    {usedModel && <p className="text-sm text-muted-foreground mt-1">Generated using: <span className="font-medium">{usedModel}</span></p>}
                  </div>
                  <div className="flex items-center bg-muted rounded-lg p-1">
                    <Button variant={showPreview ? "secondary" : "ghost"} size="sm" onClick={() => setShowPreview(true)} className="gap-1"><Eye className="h-4 w-4" />Preview</Button>
                    <Button variant={!showPreview ? "secondary" : "ghost"} size="sm" onClick={() => setShowPreview(false)} className="gap-1"><Code className="h-4 w-4" />Raw</Button>
                  </div>
                </div>
                {showPreview ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none border rounded-md p-6 bg-card min-h-[400px] overflow-auto mb-4">
                    <ReactMarkdown>{generatedDraft}</ReactMarkdown>
                  </div>
                ) : (
                  <Textarea value={generatedDraft} onChange={(e) => setGeneratedDraft(e.target.value)} rows={25} className="font-mono text-sm mb-4" />
                )}
                <Button onClick={handleSaveVersion} disabled={saving} size="lg" className="w-full">
                  {saving ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" />Saving...</>) : ("Save & Go to Workspace")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      <GoogleDrivePickerDialog
        open={showDrivePicker}
        onOpenChange={setShowDrivePicker}
        projectId={projectId!}
        onImported={invalidateJobs}
      />
    </>
  );
}
