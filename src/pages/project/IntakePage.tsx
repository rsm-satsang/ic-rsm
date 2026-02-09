import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
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
import PageNavigationBanner from "@/components/ui/PageNavigationBanner";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Youtube,
  Link as LinkIcon,
  Sparkles,
  FileText,
  Trash2,
  Eye,
  Code,
  Plus,
} from "lucide-react";

export default function IntakePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [goal, setGoal] = useState("substack_newsletter");
  const [customGoal, setCustomGoal] = useState("");
  const [language, setLanguage] = useState("english");
  const [selectedModel, setSelectedModel] = useState("gpt-5");
  const [llmInstructions, setLlmInstructions] = useState("");
  const [vocabulary, setVocabulary] = useState("");
  const [projectTitle, setProjectTitle] = useState(() => {
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    return `New Project - ${today}`;
  });
  const [savingTitle, setSavingTitle] = useState(false);
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [rawTextReferences, setRawTextReferences] = useState<Array<{ id: string; text: string; title: string }>>([]);
  const [currentRawText, setCurrentRawText] = useState("");
  const [showExtractedDraft, setShowExtractedDraft] = useState(false);
  const [extractedDraft, setExtractedDraft] = useState("");
  const [referenceNotes, setReferenceNotes] = useState<Record<string, string>>({});
  const [generatedDraft, setGeneratedDraft] = useState(() => {
    if (projectId) {
      return localStorage.getItem(`draft_${projectId}`) || "";
    }
    return "";
  });
  const [draftGenerated, setDraftGenerated] = useState(() => {
    if (projectId) {
      return !!localStorage.getItem(`draft_${projectId}`);
    }
    return false;
  });
  const [customInstructions, setCustomInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState("General");
  const [themes, setThemes] = useState<Array<{ id: string; name: string }>>([]);
  const [showAddTheme, setShowAddTheme] = useState(false);
  const [newThemeName, setNewThemeName] = useState("");
  const [usedModel, setUsedModel] = useState<string | null>(() => {
    if (projectId) {
      return localStorage.getItem(`draft_model_${projectId}`);
    }
    return null;
  });

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
    fetchThemes();
  }, [projectId]);

  const fetchThemes = async () => {
    try {
      const { data, error } = await supabase
        .from("themes")
        .select("id, name")
        .order("name", { ascending: true });
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
      const { data, error } = await supabase
        .from("themes")
        .insert({ name: newThemeName.trim(), created_by: user.id })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") {
          toast.error("Theme already exists");
        } else {
          throw error;
        }
        return;
      }
      setThemes(prev => [...prev, { id: data.id, name: data.name }].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTheme(data.name);
      saveThemeToProject(data.name);
      setNewThemeName("");
      setShowAddTheme(false);
      toast.success("Theme added!");
    } catch (error: any) {
      console.error("Error adding theme:", error);
      toast.error("Failed to add theme");
    }
  };

  const saveThemeToProject = async (themeName: string) => {
    try {
      const currentMetadata = project?.metadata || {};
      await supabase
        .from("projects")
        .update({ metadata: { ...currentMetadata, theme: themeName }, updated_at: new Date().toISOString() })
        .eq("id", projectId);
    } catch (error) {
      console.error("Error saving theme:", error);
    }
  };

  const handleThemeChange = (value: string) => {
    if (value === "__add_theme__") {
      setShowAddTheme(true);
      return;
    }
    setSelectedTheme(value);
    saveThemeToProject(value);
  };

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

  // Persist draft to localStorage
  useEffect(() => {
    if (projectId && generatedDraft) {
      localStorage.setItem(`draft_${projectId}`, generatedDraft);
    }
  }, [projectId, generatedDraft]);

  // Persist used model to localStorage
  useEffect(() => {
    if (projectId && usedModel) {
      localStorage.setItem(`draft_model_${projectId}`, usedModel);
    }
  }, [projectId, usedModel]);

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
      if (metadata?.selectedModel) {
        setSelectedModel(metadata.selectedModel);
      }
      if (metadata?.llm_instructions) {
        setLlmInstructions(metadata.llm_instructions);
      }
      if (metadata?.theme) {
        setSelectedTheme(metadata.theme);
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
        // Convert HTML back to plain text for editing (preserve line breaks)
        const htmlContent = versions[0].content;
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = htmlContent;

        // Inject explicit newlines before extracting text so paragraphs/line breaks survive round-tripping
        tempDiv.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
        tempDiv.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote").forEach((el) => el.append("\n\n"));

        const plainText = (tempDiv.textContent || "").replace(/\n{3,}/g, "\n\n").trim();

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

  const handleSaveTitle = useCallback(
    async (title: string) => {
      if (!title.trim()) return;

      setSavingTitle(true);
      try {
        const { error } = await supabase
          .from("projects")
          .update({ title, updated_at: new Date().toISOString() })
          .eq("id", projectId);

        if (error) throw error;
        setProject((prev: any) => ({ ...prev, title }));
      } catch (error: any) {
        console.error("Title save failed:", error);
        toast.error("Failed to save title");
      } finally {
        setSavingTitle(false);
      }
    },
    [projectId],
  );

  const handleTitleChange = (newTitle: string) => {
    setProjectTitle(newTitle);
    if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    titleSaveTimerRef.current = setTimeout(() => {
      handleSaveTitle(newTitle);
    }, 800);
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
    };
  }, []);

  const getGoalInstructions = (goalType: string, customGoalText?: string, targetLanguage?: string) => {
    const instructions: Record<string, string> = {
      substack_newsletter: `You are an expert spiritual editorial writer and newsletter editor. Your task is to transform the provided reference materials into a Substack newsletter in the signature style of a Satsang spiritual newsletter.

Your writing must feel like it comes from a compassionate spiritual guide speaking to a sincere community of seekers — calm, reflective, experiential, and grace-centered.

You are not summarizing.
You are recreating the lived experience of reading a spiritually grounded, devotional newsletter.

🌿 TONE & VOICE (MANDATORY)

Write with a voice that is:
• Warm, gentle, and emotionally reassuring
• Reflective and spiritually grounded
• Personal but not casual
• Deep yet simple
• Devotional without being preachy
• Wise without sounding academic

The reader should feel:
Supported. Included. Understood. Guided.

Never sound like marketing, blogging, motivational speaking, or academic writing.

🧘 CONTENT FLOW STRUCTURE

Unless the source material clearly demands a different structure, follow this teaching rhythm:

1️⃣ Gentle Hook or Opening Spiritual Insight
2️⃣ Introduction of the Core Idea or Question
3️⃣ Story, Example, Analogy, or Lived Experience
4️⃣ Deeper Teaching Section (clear spiritual explanation)
5️⃣ Practical Integration into Daily Life or Inner Growth
6️⃣ Soft Reflective Closing that leaves the reader peaceful and uplifted
7️⃣ End every newsletter with the exact closing signature written on three separate lines: ***With light, love, and peace,
Sanjiv Kumar
Ramashram Satsang Mathura***

Teach progressively. Keep language simple but meaningful.

CRITICAL OUTPUT FORMAT — RICH, ENGAGING MARKDOWN (SUBSTACK STYLE)

You must generate content that looks polished, calm, engaging, and publication-ready like a professional Substack-style spiritual newsletter.

VISUAL STYLE & EMOJIS

1. Use relevant, soft emojis throughout to make content visually expressive and gentle
2. Start major sections with calm-toned emojis (🌿 🌸 🌞 🕊️ ✨ 💫)
3. Use emojis to lightly highlight important insights or transitions — never excessively
4. Add visual separators between major sections using:
   ─────────────────
   ✦ ✦ ✦
   • • •
5. Use pull quotes or highlighted text boxes for spiritual insights:
   > 💬 "Short reflective or devotional quote"

HEADING STRUCTURE

1. Use ## for main section headings and ### for subsections
2. Keep headings reflective and meaningful, not clickbait
3. Add relevant emojis where appropriate
4. Maintain consistent heading hierarchy
5. Add ONE blank line before and after each heading

PARAGRAPH FORMATTING

1. Separate every paragraph with ONE blank line
2. Keep paragraphs short and flowing (2–4 sentences max)
3. Use occasional single-line paragraphs for emotional emphasis
4. Begin with a calm but engaging opening line

TEXT EMPHASIS

1. Use **bold text** to highlight key spiritual principles and insights
2. Use *italics* for reflective phrases or gentle emphasis
3. Use bullet lists (with soft emojis) only when clarity is needed
4. Use numbered lists only for step-by-step spiritual processes

ENGAGEMENT ELEMENTS (GENTLE, NOT MARKETING)

1. Use reflective questions occasionally
2. Include insight callouts using blockquotes
   > 🌸 Reflection
   > 💡 Gentle Insight
3. Add a short reflective takeaway section when appropriate
4. End sections with smooth, contemplative transitions

CRITICAL RULES

1. Output ONLY clean Markdown — NO HTML
2. NO code blocks
3. NO commentary or meta explanations
4. Do not mention prompts, references, or instructions
5. Do not fabricate teachings, quotes, or lineage details not present in the reference
6. The final piece must feel calm, spacious, devotional, and sincere

CONTENT INSTRUCTIONS

1. READ AND USE ALL the reference text provided below
2. Transform the raw material into a well-structured, polished newsletter
3. Preserve all key teachings, explanations, and insights
4. Do not add outside research or modern psychology unless explicitly present
5. Clarify — do not expand beyond the source meaning
6. Maintain spiritual authenticity and emotional sensitivity

Each reference text provided will come with explicit instructions and context. You must strictly obey those instructions.`,
      wordpress_blog:
        "You are a professional blogger. Please write a comprehensive WordPress blog post using the below reference text. The blog post should have a clear structure with headings, subheadings, and engaging content. Each reference article has instructions and context around the file.",
      note: "Please create a concise and organized note using the below reference text. The note should capture key points and important information in a clear format. Each reference article has instructions and context around the file.",
      book_article:
        "You are an author writing an article for a book. Please write a well-structured article using the below reference text. The article should have depth, proper citations, and flow well within a book chapter format. Each reference article has instructions and context around the file.",
      story_children:
        "You are a children's book author. Please write an engaging story for small children using the below reference text. The story should be simple, fun, educational, and age-appropriate with clear language and vivid imagery. Each reference article has instructions and context around the file.",
      story_adults:
        "You are a fiction author. Please write an engaging story for adults using the below reference text. The story should have compelling characters, plot development, and sophisticated narrative techniques. Each reference article has instructions and context around the file.",
      proofreading:
        "You are a professional proofreader and editor. Please carefully review the below reference text and correct any spelling errors, grammatical mistakes, punctuation issues, and formatting inconsistencies. Maintain the original meaning and tone while improving clarity and readability. Each reference article has instructions and context around the file.",
      translation:
        "You are a professional translator. Please translate the below reference text accurately while preserving the original meaning, tone, and style. Ensure cultural appropriateness and natural phrasing in the target language. Each reference article has instructions and context around the file.",
      other: customGoalText
        ? `Please create content based on the following instructions: ${customGoalText}. Use the below reference text. Each reference article has instructions and context around the file.`
        : "Please create content using the below reference text. Each reference article has instructions and context around the file.",
    };

    let instruction = instructions[goalType] || instructions.other;

    // Add language instruction for ALL languages including English
    const languageNames: Record<string, string> = {
      english: "English",
      hindi: "Hindi",
      tamil: "Tamil",
      german: "German",
    };
    const languageName = languageNames[targetLanguage || "english"] || targetLanguage || "English";
    instruction += `\n\n**CRITICAL REQUIREMENT**: The entire content MUST be written in ${languageName}. Generate the complete output in ${languageName} language.`;

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
            consolidatedText += `[User instructions: ${referenceNotes[file.id]}]\n\n`;
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
        selectedModel: selectedModel,
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

      console.log("=== FULL PROMPT BEING SENT TO AI ===");
      console.log("Selected Goal:", goal);
      console.log("Selected Model:", selectedModel);
      console.log("Prompt length:", promptToUse.length, "characters");
      console.log("First 500 chars:", promptToUse.substring(0, 500));
      console.log("=========================================");

      const response = await supabase.functions.invoke("gemini-ai", {
        body: {
          action: "generate_draft",
          prompt: promptToUse,
          model: selectedModel,
          projectId: projectId,
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
      setUsedModel(selectedModel);
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
    <div className="min-h-screen bg-background ml-14">
      <PageNavigationBanner
        title="Bring ideas and create first draft"
        leftLabel="Project Dashboard"
        leftPath="/dashboard"
        rightLabel="Edit and refine"
        rightPath={`/workspace/${projectId}`}
      />
      <div className="container max-w-5xl py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-1">Name Your Project</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Give your project a descriptive name to easily identify it later
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={projectTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="flex-1 text-lg font-medium"
                placeholder="Project title..."
              />
              {savingTitle && <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>}
            </div>
          </div>

          {/* Define Outcome Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Define Outcome</h2>

            <div className="pl-4 space-y-4">
              {/* Output Goal */}
              <div>
                <Label className="text-base font-semibold mb-2 block">What do you want to generate?</Label>
                <Select value={goal} onValueChange={setGoal}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select content type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="substack_newsletter">Substack newsletter</SelectItem>
                    <SelectItem value="wordpress_blog">Wordpress Blog</SelectItem>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="book_article">Article for a book</SelectItem>
                    <SelectItem value="story_children">Story for small children</SelectItem>
                    <SelectItem value="story_adults">Story for adults</SelectItem>
                    <SelectItem value="proofreading">Proofreading</SelectItem>
                    <SelectItem value="translation">Translation</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
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
              <div>
                <Label className="text-base font-semibold mb-2 block">
                  What language you want your final content to be in
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
              </div>

              {/* Model Selection */}
              <div>
                <Label className="text-base font-semibold mb-2 block">Which AI model to use</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select AI model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini 2.5 Flash (Default - Fast & Balanced)</SelectItem>
                    <SelectItem value="gemini-3">Gemini 3 Flash (Preview - Fast & Advanced)</SelectItem>
                    <SelectItem value="gpt-5">GPT-5 (Premium - Best Quality)</SelectItem>
                    <SelectItem value="gpt-5.2">GPT-5.2 (Latest - Enhanced Reasoning)</SelectItem>
                    <SelectItem value="gpt-5-mini">GPT-5 Mini (Fast & Cost-Efficient)</SelectItem>
                    <SelectItem value="gpt-5-nano">GPT-5 Nano (Fastest & Most Economical)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator className="my-8" />

          {/* Add References Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-2">Add References</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Upload documents, paste text, or add links to articles and videos that will serve as source material for
              generating your content.
            </p>

            <div className="pl-4 space-y-6">
              {/* Raw Text References */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Paste or type your text here</h3>
                <Textarea
                  placeholder="Paste or type your reference text here..."
                  value={currentRawText}
                  onChange={(e) => setCurrentRawText(e.target.value)}
                  rows={4}
                  className="mb-2"
                />
                <div className="flex justify-end">
                  <Button onClick={handleAddRawText} disabled={!currentRawText.trim()}>
                    Add
                  </Button>
                </div>
              </div>

              {/* File Uploader */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Add Files</h3>
                <ReferenceUploader projectId={projectId!} onUploadComplete={invalidateJobs} />
              </div>

              {/* YouTube Link */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Add YouTube Video</h3>
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
                <h3 className="text-lg font-semibold mb-3">Add Weblink</h3>
                <div className="flex gap-2">
                  <Input
                    placeholder="Paste any URL..."
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
            </div>
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
          <Separator />

          {/* Reference Files Status */}
          {(referenceFiles.length > 0 || rawTextReferences.length > 0) && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Review your reference text / document and add Instructions</h2>
              <div className="space-y-3">
                {/* Uploaded Files */}
                {referenceFiles.map((file) => (
                  <div key={file.id}>
                    <JobStatusCard file={file} onDelete={handleDeleteFile} onRetry={handleRetry} />
                    <div className="mt-2 pl-11">
                      <Textarea
                        placeholder={`Please add instructions on how to use the above document / resource. For example - "Use only the story around service from this document, ignore everything else" or "Leverage only the scientific facts quoted in this document for the newsletter"`}
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
                        placeholder={`Please add instructions on how to use the above document / resource. For example - "Use only the story around service from this document, ignore everything else" or "Leverage only the scientific facts quoted in this document for the newsletter"`}
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
                    Preparing input for AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    Prepare consolidated input to AI
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                This will combine text from references and instructions into a consolidated input to AI.
              </p>
            </div>
          )}

          {/* Extracted Draft View */}
          {showExtractedDraft && (
            <div className="mt-8 pt-6 border-t">
              <h2 className="text-xl font-semibold mb-3">Consolidated input to AI(editable)</h2>
              <div className="bg-muted/50 border border-border rounded-lg p-3 mb-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> This draft includes goal-based instructions at the top (based on your selected
                  goal: <strong>{goal === "other" ? customGoal : goal.replace(/_/g, " ")}</strong>). You can edit or
                  remove these instructions if they cause AI generation issues. Your edits will be used when you click
                  "Prepare consolidated input to AI".
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
                      Generating Draft...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-5 w-5" />
                      Ask AI to generate draft
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
                <div>
                  <h2 className="text-2xl font-semibold">Generated Draft</h2>
                  {usedModel && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Generated using:{" "}
                      <span className="font-medium">
                        {usedModel === "gemini"
                          ? "Gemini 2.5 Flash"
                          : usedModel === "gpt-5-mini"
                            ? "GPT-5 Mini"
                            : usedModel === "gpt-5-nano"
                              ? "GPT-5 Nano"
                              : usedModel}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-muted rounded-lg p-1">
                    <Button
                      variant={showPreview ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setShowPreview(true)}
                      className="gap-1"
                    >
                      <Eye className="h-4 w-4" />
                      Preview
                    </Button>
                    <Button
                      variant={!showPreview ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setShowPreview(false)}
                      className="gap-1"
                    >
                      <Code className="h-4 w-4" />
                      Raw
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-green-600">
                    <Sparkles className="h-5 w-5" />
                    <span className="text-sm font-medium">Draft Generated</span>
                  </div>
                </div>
              </div>

              {showPreview ? (
                <div className="prose prose-sm dark:prose-invert max-w-none border rounded-md p-6 bg-card min-h-[400px] overflow-auto mb-4">
                  <ReactMarkdown>{generatedDraft}</ReactMarkdown>
                </div>
              ) : (
                <Textarea
                  value={generatedDraft}
                  onChange={(e) => setGeneratedDraft(e.target.value)}
                  rows={25}
                  className="font-mono text-sm mb-4"
                />
              )}

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
