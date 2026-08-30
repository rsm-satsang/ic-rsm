import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Save, Settings, Trash2, CheckCircle, Eye, Code, MessageSquare, ListTodo, ImageIcon, Send, FileCheck2, PanelRightOpen, PanelRightClose, ChevronDown, Type, CalendarIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import GenerateImageDialog from "@/components/workspace/GenerateImageDialog";
import AddImageDialog from "@/components/workspace/AddImageDialog";
import NotifyReviewersDialog from "@/components/workspace/NotifyReviewersDialog";
import VersionNotesPanel from "@/components/workspace/VersionNotesPanel";
import ManagePanel from "@/components/workspace/ManagePanel";
import AssignDialog from "@/components/workspace/AssignDialog";
import CommentsPanel from "@/components/workspace/CommentsPanel";
import VersionsSidebar from "@/components/workspace/VersionsSidebar";
import ProjectImagesSection from "@/components/workspace/ProjectImagesSection";
import { WorkspaceSidebar } from "@/components/workspace/WorkspaceSidebar";
import TimelineFeed from "@/components/workspace/TimelineFeed";
import InviteDialog from "@/components/workspace/InviteDialog";
import PageNavigationBanner from "@/components/ui/PageNavigationBanner";
import { useAutosave } from "@/hooks/useAutosave";
import type { User } from "@supabase/supabase-js";
import { formatDate, formatDateTime } from "@/lib/datetime";

function mondayOf(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function firstMondayOfYear(year: number): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const day = jan1.getUTCDay();
  const offset = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  jan1.setUTCDate(jan1.getUTCDate() + offset);
  return jan1;
}

function weeksOfYear(year: number): string[] {
  const out: string[] = [];
  const start = firstMondayOfYear(year);
  const end = mondayOf(new Date(Date.UTC(year, 11, 31)));
  const d = new Date(start);
  while (d.getTime() <= end.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

function weekRangeLabel(iso: string): string {
  const start = new Date(iso + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
}

interface Project {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: "draft" | "in_progress" | "review" | "approved" | "published";
  owner_id: string;
  metadata?: any;
}

type DraftStage =
  | "s1_preparing"
  | "s2_submit_concept"
  | "s3_awaiting_concept"
  | "s4_concept_approved"
  | "s5_submit_peer"
  | "s6_awaiting_peer"
  | "s7_peer_done"
  | "s7_awaiting_final"
  | "s8_ready"
  | "s9_published";

const DRAFT_STAGES: { value: DraftStage; label: string }[] = [
  { value: "s1_preparing", label: "Stg 1. Preparing first draft" },
  { value: "s2_submit_concept", label: "Stg 2. Submit for Concept Review" },
  { value: "s3_awaiting_concept", label: "Stg 3. Awaiting Concept Review" },
  { value: "s4_concept_approved", label: "Stg 4. Concept Approved, Refinements in Progress" },
  { value: "s5_submit_peer", label: "Stg 5. Submit for Peer Review" },
  { value: "s6_awaiting_peer", label: "Stg 6. Awaiting Peer Review" },
  { value: "s7_peer_done", label: "Stg 7. Peer Review done, Refinements In Progress" },
  { value: "s7_awaiting_final", label: "Stg 8. Send Draft and Review Comments for Final Go Ahead" },
  { value: "s8_ready", label: "Stg 9. Ready to move to Publishing Channel" },
  { value: "s9_published", label: "Stg 10. Published" },
];

// Stages set automatically by the workflow — not user-selectable
const AUTO_STAGES: DraftStage[] = [
  "s3_awaiting_concept",
  "s4_concept_approved",
  "s6_awaiting_peer",
  "s7_peer_done",
];


// Map legacy stage values stored before the 9-stage workflow
const LEGACY_STAGE_MAP: Record<string, DraftStage> = {
  preparing: "s1_preparing",
  concept_review: "s3_awaiting_concept",
  refinements: "s4_concept_approved",
  peer_review: "s6_awaiting_peer",
  ready: "s8_ready",
};

const CONCEPT_QUESTION =
  "Please write a brief note about the draft answering the following questions - What is the key message you want to convey through this ? How is this relevant ? What reference sources is this based upon ?";

const CONCEPT_OUTCOMES = ["Approved", "Refinements required", "Discard"] as const;
type ConceptOutcome = (typeof CONCEPT_OUTCOMES)[number];

interface ConceptReview {
  outcome: ConceptOutcome;
  comments: string;
  by?: string;
  at?: string;
}

interface PeerReviewEntry {
  comments: string;
  by?: string;
  byId?: string;
  at?: string;
  /** Set when an admin records the comment as an approval */
  approved?: boolean;
}


const Workspace = () => {

  const { projectId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [linkedEntry, setLinkedEntry] = useState<{ week_start_date: string; build_due_date: string | null } | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [newVersionName, setNewVersionName] = useState("");
  const [currentStatus, setCurrentStatus] = useState<"draft" | "in_progress" | "review" | "approved" | "published">(
    "draft",
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [editorRef, setEditorRef] = useState<any>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [selectedVersionForView, setSelectedVersionForView] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [notifyingReviewers, setNotifyingReviewers] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("preview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [leftPanel, setLeftPanel] = useState<"versions" | "timeline" | "comments" | null>(null);
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg" | "xl">("sm");

  const [showImageDialog, setShowImageDialog] = useState(false);
  const [draftStage, setDraftStage] = useState<DraftStage>("s1_preparing");
  const [conceptDialogOpen, setConceptDialogOpen] = useState(false);
  const [conceptAnswer, setConceptAnswer] = useState("");
  const [conceptDueDate, setConceptDueDate] = useState("");
  const [savingConcept, setSavingConcept] = useState(false);
  const [conceptNote, setConceptNote] = useState<{ answer: string; by?: string; at?: string; due_date?: string } | null>(null);
  const [conceptReview, setConceptReview] = useState<ConceptReview | null>(null);
  const [reviewBoxOpen, setReviewBoxOpen] = useState(true);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewComments, setReviewComments] = useState("");
  const [reviewOutcome, setReviewOutcome] = useState<ConceptOutcome | "">("");
  const [savingReview, setSavingReview] = useState(false);
  const [peerDialogOpen, setPeerDialogOpen] = useState(false);
  const [builders, setBuilders] = useState<{ id: string; name: string; email: string }[]>([]);
  const [peerReviewerIds, setPeerReviewerIds] = useState<string[]>([]);
  const [peerReviewers, setPeerReviewers] = useState<{ id: string; name: string }[]>([]);
  const [peerSubmitNote, setPeerSubmitNote] = useState("");
  const [peerDueDate, setPeerDueDate] = useState("");
  const [peerRequest, setPeerRequest] = useState<{ note?: string; due_date?: string } | null>(null);
  const [savingPeer, setSavingPeer] = useState(false);
  const [peerReviews, setPeerReviews] = useState<PeerReviewEntry[]>([]);
  const [peerCommentDialogOpen, setPeerCommentDialogOpen] = useState(false);
  const [peerCommentText, setPeerCommentText] = useState("");
  const [savingPeerComment, setSavingPeerComment] = useState(false);
  const [peerCommentApproved, setPeerCommentApproved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Once the draft reaches Stg 9 (Ready to move to Publishing Channel) or beyond,
  // it is locked for everyone except admins.
  const editLocked = !isAdmin && (draftStage === "s8_ready" || draftStage === "s9_published");

  // Peer review comments only open once the draft has been submitted for Peer Review (Stg 5+).
  const peerReviewUnlocked = ["s5_submit_peer", "s6_awaiting_peer", "s7_peer_done", "s7_awaiting_final", "s8_ready", "s9_published"].includes(draftStage);


  const [markdownContent, setMarkdownContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(true);
  const [heroImage, setHeroImage] = useState<{ id?: string; storage_path?: string | null; url: string; caption: string | null } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);



  // Autosave: title
  const autosaveTitle = useCallback(async (title: string) => {
    if (!project || !user || title === project.title) return;
    try {
      const { error } = await supabase
        .from("projects")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", project.id);
      if (error) throw error;
      setProject(prev => prev ? { ...prev, title } : prev);
      console.log("Title autosaved");
    } catch (e) {
      console.error("Title autosave failed:", e);
    }
  }, [project, user]);

  useAutosave(projectTitle, autosaveTitle, 1500, !!project && !!user && !editLocked);

  // Autosave: editor content
  const autosaveContent = useCallback(async (content: string) => {
    if (!project || !user || !currentVersionId) return;
    if (!content.trim() || content === "Start writing your content here...") return;
    const html = markdownToHtml(content);
    try {
      const { error } = await supabase
        .from("versions")
        .update({ content: html })
        .eq("id", currentVersionId);
      if (error) throw error;
      console.log("Content autosaved");
    } catch (e) {
      console.error("Content autosave failed:", e);
    }
  }, [project, user, currentVersionId]);

  useAutosave(markdownContent, autosaveContent, 2000, !!project && !!user && !!currentVersionId && !editLocked);

  const handleTextSelection = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      if (start !== end) {
        const text = markdownContent.substring(start, end);
        setSelectedText(text);
        selectionRef.current = { start, end };
      }
    }
  };

  const handleInsertText = async (text: string, aiFeatureName: string) => {
    console.log("Creating new version with AI output from:", aiFeatureName);

    if (!project || !user) {
      console.error("Project not available");
      toast.error("Project not ready. Please try again.");
      return;
    }

    try {
      // Replace selected text with AI response, or append if no selection
      let updatedContent: string;
      if (selectionRef.current && selectedText) {
        const { start, end } = selectionRef.current;
        updatedContent = markdownContent.substring(0, start) + text + markdownContent.substring(end);
      } else {
        updatedContent = markdownContent + "\n\n" + text;
      }
      setMarkdownContent(updatedContent);
      setSelectedText(""); // Clear selection after insert
      selectionRef.current = null;

      // Convert to HTML for storage
      const content = markdownToHtml(updatedContent);

      // Get current version name
      const { data: currentVersion } = await supabase
        .from("versions")
        .select("title, version_number")
        .eq("id", currentVersionId || "")
        .single();

      // Get max version number for this feature name pattern
      const baseVersionName = `${aiFeatureName} - ${currentVersion?.title || "untitled"}`;
      const { data: existingVersions } = await supabase
        .from("versions")
        .select("title")
        .eq("project_id", project.id)
        .ilike("title", `${baseVersionName}%`);

      // Calculate next number
      let nextNumber = 1;
      if (existingVersions && existingVersions.length > 0) {
        const numbers = existingVersions
          .map((v) => {
            const match = v.title.match(/\s(\d+)$/);
            return match ? parseInt(match[1]) : 0;
          })
          .filter((n) => n > 0);
        nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
      }

      const newVersionName = `${baseVersionName} ${nextNumber}`;

      // Get current max version number
      const { data: maxVersionData } = await supabase
        .from("versions")
        .select("version_number")
        .eq("project_id", project.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      const newVersionNumber = (maxVersionData?.version_number || 0) + 1;

      // Create new version
      const { error: versionError } = await supabase.from("versions").insert({
        project_id: project.id,
        version_number: newVersionNumber,
        title: newVersionName,
        content: content,
        created_by: user.id,
      });

      if (versionError) throw versionError;

      // Log to timeline
      const { data: userData } = await supabase.from("users").select("name").eq("id", user.id).single();

      await supabase.from("timeline").insert({
        project_id: project.id,
        event_type: "edited",
        event_details: {
          action: "ai_version_created",
          version: newVersionNumber,
          versionName: newVersionName,
          aiFeature: aiFeatureName,
        },
        user_id: user.id,
        user_name: userData?.name || "Unknown User",
      });

      toast.success(`New version "${newVersionName}" created successfully!`);
    } catch (error: any) {
      console.error("Error creating AI version:", error);
      toast.error("Failed to create new version");
    }
  };

  const handleEditorReady = (editor: any) => {
    console.log("Editor ready, setting ref");
    setEditorRef(editor);
  };

  const handleVersionSelect = (versionId: string) => {
    console.log("Version selected:", versionId);
    // When a version is selected from sidebar, reload it in the editor
    setSelectedVersionForView(versionId);
    setCurrentVersionId(versionId);
  };

  useEffect(() => {
    checkUserAndLoadProject();
  }, [projectId]);

  // Subscribe to project_images so the hero box updates after upload/generate
  useEffect(() => {
    if (!projectId) return;
    const fetchHero = async () => {
      const { data } = await supabase
        .from("project_images")
        .select("id, image_url, storage_path, prompt")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setHeroImage(data ? { id: data.id, storage_path: data.storage_path, url: data.image_url, caption: data.prompt } : null);
    };
    fetchHero();
    const channel = supabase
      .channel(`workspace-images-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_images", filter: `project_id=eq.${projectId}` },
        () => fetchHero()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  const handleDeleteHeroImage = async () => {
    if (!heroImage?.id) return;
    if (!confirm("Delete this image? This cannot be undone.")) return;
    try {
      if (heroImage.storage_path) {
        await supabase.storage.from("project-images").remove([heroImage.storage_path]);
      }
      const { error } = await supabase.from("project_images").delete().eq("id", heroImage.id);
      if (error) throw error;
      setHeroImage(null);
      toast.success("Image deleted");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to delete image");
    }
  };

  // Load version content when version changes
  useEffect(() => {
    if (selectedVersionForView) {
      loadVersionContent(selectedVersionForView);
    } else if (projectId) {
      loadLatestVersionContent();
    }
  }, [selectedVersionForView, projectId]);

  const loadVersionContent = async (versionId: string) => {
    setLoadingContent(true);
    try {
      const { data, error } = await supabase.from("versions").select("content").eq("id", versionId).single();

      if (error) throw error;

      // Convert HTML to markdown-ish plain text preserving line breaks
      const content = htmlToMarkdown(data.content || "");
      setMarkdownContent(content);
    } catch (error) {
      console.error("Error loading version:", error);
    } finally {
      setLoadingContent(false);
    }
  };

  const loadLatestVersionContent = async () => {
    setLoadingContent(true);
    try {
      const { data, error } = await supabase
        .from("versions")
        .select("id, content")
        .eq("project_id", projectId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCurrentVersionId(data.id);
        const content = htmlToMarkdown(data.content || "");
        setMarkdownContent(content);
      } else {
        setMarkdownContent("Start writing your content here...");
      }
    } catch (error) {
      console.error("Error loading latest version:", error);
    } finally {
      setLoadingContent(false);
    }
  };

  // Convert HTML to plain text preserving exact newlines
  const htmlToMarkdown = (html: string): string => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;

    // Replace br with newlines
    tempDiv.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));

    // Add proper spacing for block elements
    tempDiv.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote").forEach((el) => {
      el.prepend("\n\n");
    });

    const text = (tempDiv.textContent || "").replace(/\n{3,}/g, "\n\n").trim();

    return text;
  };

  // Convert plain text back to HTML for saving
  const markdownToHtml = (text: string): string => {
    // Split by double newlines for paragraphs
    const paragraphs = text.split(/\n\n+/);
    return paragraphs
      .map((p) => {
        // Handle single newlines within paragraphs as <br>
        const withBreaks = p.replace(/\n/g, "<br>");
        return `<p>${withBreaks}</p>`;
      })
      .join("");
  };

  const checkUserAndLoadProject = async () => {
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        navigate("/auth");
        return;
      }

      setUser(currentUser);

      if (projectId) {
        await loadProject(projectId);
      }
    } catch (error) {
      console.error("Error:", error);
      navigate("/auth");
    } finally {
      setLoading(false);
    }
  };

  const loadProject = async (id: string) => {
    try {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();

      if (error) throw error;

      setProject(data);
      setProjectTitle(data.title);
      setCurrentStatus(data.status);

      const { data: linked } = await supabase
        .from("tracker_entries")
        .select("week_start_date, build_due_date")
        .eq("project_id", data.id)
        .maybeSingle();
      setLinkedEntry((linked as any) ?? null);

      const meta = (data as any).metadata || {};
      const rawStage: string | undefined = meta.draft_stage;
      const mapped =
        rawStage && DRAFT_STAGES.some((s) => s.value === rawStage)
          ? (rawStage as DraftStage)
          : rawStage && LEGACY_STAGE_MAP[rawStage]
          ? LEGACY_STAGE_MAP[rawStage]
          : data.status === "published"
          ? "s9_published"
          : data.status === "approved"
          ? "s8_ready"
          : "s1_preparing";
      setDraftStage(mapped);
      setConceptNote(meta.concept_note ?? null);
      setConceptAnswer(meta.concept_note?.answer ?? "");
      setConceptDueDate(meta.concept_note?.due_date ?? "");
      setConceptReview(meta.concept_review ?? null);
      setPeerReviewerIds(meta.peer_reviewer_ids ?? []);
      setPeerReviews(meta.peer_reviews ?? []);
      setPeerRequest(meta.peer_request ?? null);



      // If the project has comments, open the Comments tab by default
      const { count } = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id);
      setLeftPanel((prev) => prev ?? ((count ?? 0) > 0 ? "comments" : null));
    } catch (error: any) {
      toast.error("Failed to load project");
      console.error(error);
      navigate("/dashboard");
    }
  };

  const handleSaveCurrentVersion = async () => {
    if (!project || !user) {
      toast.error("Project or user not loaded");
      return;
    }

    setSaving(true);
    try {
      // Convert markdown content to HTML for storage
      const content = markdownToHtml(markdownContent);

      if (
        !content ||
        content === "<p></p>" ||
        markdownContent.trim() === "" ||
        markdownContent === "Start writing your content here..."
      ) {
        toast.error("No content to save");
        setSaving(false);
        return;
      }

      // If no current version ID, find the latest version
      let versionId = currentVersionId;
      if (!versionId) {
        const { data: latestVersion } = await supabase
          .from("versions")
          .select("id")
          .eq("project_id", project.id)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestVersion) {
          versionId = latestVersion.id;
          setCurrentVersionId(versionId);
        } else {
          toast.error("No version found. Please create a version first by going to the intake page.");
          setSaving(false);
          return;
        }
      }

      // Get current version info
      const { data: versionData } = await supabase
        .from("versions")
        .select("version_number, title")
        .eq("id", versionId)
        .single();

      // Update current version
      const { error: versionError } = await supabase.from("versions").update({ content: content }).eq("id", versionId);

      if (versionError) throw versionError;

      // Also persist project title
      if (projectTitle && projectTitle !== project.title) {
        const { error: titleError } = await supabase
          .from("projects")
          .update({ title: projectTitle, updated_at: new Date().toISOString() })
          .eq("id", project.id);
        if (titleError) throw titleError;
        setProject({ ...project, title: projectTitle });
      }

      // Add timeline entry
      const { data: userData } = await supabase.from("users").select("name").eq("id", user.id).single();

      await supabase.from("timeline").insert({
        project_id: project.id,
        event_type: "edited",
        event_details: {
          action: "version_updated",
          version: versionData?.version_number,
          versionName: versionData?.title,
        },
        user_id: user.id,
        user_name: userData?.name || "Unknown User",
      });

      toast.success("Version saved successfully!");
    } catch (error: any) {
      console.error("Save failed:", error);
      toast.error(error?.message || "Failed to save version");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!project || !user) return;

    setSavingTitle(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({ title: projectTitle, updated_at: new Date().toISOString() })
        .eq("id", project.id);

      if (error) throw error;

      toast.success("Project title saved!");
      setProject({ ...project, title: projectTitle });
    } catch (error: any) {
      console.error("Title save failed:", error);
      toast.error(error?.message || "Failed to save title");
    } finally {
      setSavingTitle(false);
    }
  };

  const handleSaveAsNewVersion = async (newVersionName: string) => {
    if (!project || !user || !newVersionName.trim()) return;

    setSaving(true);
    try {
      console.log("Starting save operation...");

      // Retry logic for project update
      let updateSuccess = false;
      let lastError = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`Attempt ${attempt} to update project...`);

          const { error: projectError } = await supabase
            .from("projects")
            .update({
              title: projectTitle,
              updated_at: new Date().toISOString(),
            })
            .eq("id", project.id);

          if (projectError) {
            console.error(`Attempt ${attempt} failed:`, projectError);
            lastError = projectError;
            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
              continue;
            }
            throw projectError;
          }

          console.log("Project updated successfully");
          updateSuccess = true;
          break;
        } catch (err: any) {
          console.error(`Update attempt ${attempt} error:`, err);
          lastError = err;
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      if (!updateSuccess) {
        throw lastError || new Error("Failed to update project after 3 attempts");
      }

      // Convert markdown content to HTML for storage
      const content = markdownToHtml(markdownContent);

      // Get current max version number
      const { data: maxVersionData } = await supabase
        .from("versions")
        .select("version_number")
        .eq("project_id", project.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      const newVersionNumber = (maxVersionData?.version_number || 0) + 1;

      // Create new version with custom name
      const { error: versionError } = await supabase.from("versions").insert({
        project_id: project.id,
        version_number: newVersionNumber,
        title: newVersionName.trim(),
        content: content,
        created_by: user.id,
      });

      if (versionError) throw versionError;

      // Log to timeline
      const { data: userData } = await supabase.from("users").select("name").eq("id", user.id).single();

      await supabase.from("timeline").insert({
        project_id: project.id,
        event_type: "edited",
        event_details: { action: "saved", version: newVersionNumber, versionName: newVersionName.trim() },
        user_id: user.id,
        user_name: userData?.name || "Unknown User",
      });

      toast.success("Project saved successfully!");
    } catch (error: any) {
      console.error("Save failed:", error);
      const errorMessage = error?.message || "Failed to save project";
      toast.error(errorMessage);

      // Show more detailed error in console
      if (error?.code) {
        console.error("Error code:", error.code);
      }
      if (error?.details) {
        console.error("Error details:", error.details);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: "draft" | "in_progress" | "review" | "approved" | "published") => {
    if (!project || !user) return;

    try {
      console.log("Updating status to:", newStatus);

      // Retry logic for status update
      let updateSuccess = false;
      let lastError = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`Attempt ${attempt} to update status...`);

          const { error: statusError } = await supabase
            .from("projects")
            .update({ status: newStatus })
            .eq("id", project.id);

          if (statusError) {
            console.error(`Attempt ${attempt} failed:`, statusError);
            lastError = statusError;
            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
              continue;
            }
            throw statusError;
          }

          console.log("Status updated successfully");
          updateSuccess = true;
          break;
        } catch (err: any) {
          console.error(`Status update attempt ${attempt} error:`, err);
          lastError = err;
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      if (!updateSuccess) {
        throw lastError || new Error("Failed to update status after 3 attempts");
      }

      // Log status change
      const { data: userData } = await supabase.from("users").select("name").eq("id", user.id).single();

      await supabase.from("status_history").insert({
        project_id: project.id,
        old_status: currentStatus,
        new_status: newStatus,
        changed_by: user.id,
      });

      await supabase.from("timeline").insert({
        project_id: project.id,
        event_type: "status_change",
        event_details: { from: currentStatus, to: newStatus },
        user_id: user.id,
        user_name: userData?.name || "Unknown User",
      });

      setCurrentStatus(newStatus);
      toast.success(`Status updated to ${newStatus}`);
    } catch (error: any) {
      console.error("Status update failed:", error);
      const errorMessage = error?.message || "Failed to update status";
      toast.error(errorMessage);
    }
  };

  const handleDeleteProject = async () => {
    if (!project || !user) return;

    try {
      const { error } = await supabase.from("projects").delete().eq("id", project.id);

      if (error) throw error;

      toast.success("Project deleted successfully");
      navigate("/dashboard");
    } catch (error: any) {
      console.error("Delete failed:", error);
      toast.error(error?.message || "Failed to delete project");
    }
  };

  const handleCopyToPublish = async () => {
    if (!project || !user) {
      toast.error("Please log in to export");
      return;
    }

    try {
      // Get editor content
      const editorElement = document.querySelector(".ProseMirror");
      const htmlContent = editorElement?.innerHTML || "";

      if (!htmlContent || htmlContent === "<p></p>") {
        toast.error("No content to export");
        return;
      }

      // Create a temporary div to parse HTML and extract text
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = htmlContent;

      // Convert HTML to plain text with proper formatting
      let plainText = "";

      // Process each element
      const elements = tempDiv.querySelectorAll("*");
      elements.forEach((element) => {
        const tagName = element.tagName.toLowerCase();
        const text = element.textContent?.trim() || "";

        if (!text) return;

        // Add appropriate spacing based on element type
        if (tagName === "h1") {
          plainText += `\n\n# ${text}\n\n`;
        } else if (tagName === "h2") {
          plainText += `\n\n## ${text}\n\n`;
        } else if (tagName === "h3") {
          plainText += `\n\n### ${text}\n\n`;
        } else if (tagName === "p") {
          plainText += `${text}\n\n`;
        } else if (tagName === "li") {
          plainText += `• ${text}\n`;
        } else if (tagName === "blockquote") {
          plainText += `\n> ${text}\n\n`;
        } else if (!element.querySelector("*")) {
          // Only add text if element has no children (leaf node)
          plainText += `${text} `;
        }
      });

      // Clean up extra whitespace
      plainText = plainText.replace(/\n{3,}/g, "\n\n").trim();

      // Add title at the top
      const contentToPublish = `${projectTitle}\n\n${plainText}`;

      // Copy to clipboard
      await navigator.clipboard.writeText(contentToPublish);

      toast.success("Content copied to clipboard!", {
        description: "Plain text format ready to paste into Substack or WordPress.",
        duration: 6000,
      });

      // Log to timeline
      const { data: userData } = await supabase.from("users").select("name").eq("id", user.id).single();

      await supabase.from("timeline").insert({
        project_id: project.id,
        event_type: "edited",
        event_details: {
          action: "exported_to_publish",
        },
        user_id: user.id,
        user_name: userData?.name || "Unknown User",
      });
    } catch (error: any) {
      console.error("Export failed:", error);
      toast.error(error?.message || "Failed to copy content");
    }
  };

  const handleNotifyReviewers = async () => {
    if (!project || !user) return;
    setNotifyingReviewers(true);
    try {
      let versionLabel = "Latest";
      if (currentVersionId) {
        const { data: v } = await supabase
          .from("versions")
          .select("title, version_number")
          .eq("id", currentVersionId)
          .maybeSingle();
        if (v) versionLabel = `${v.title || "Untitled"} (v${v.version_number ?? "?"})`;
      }

      const { data, error } = await supabase.functions.invoke("notify-reviewers", {
        body: { projectId: project.id, versionId: currentVersionId, requesterId: user.id },
      });
      if (error) throw error;

      const { data: userData } = await supabase.from("users").select("name").eq("id", user.id).single();
      await supabase.from("timeline").insert({
        project_id: project.id,
        event_type: "review_requested" as any,
        event_details: {
          version: versionLabel,
          recipients: (data as any)?.sent ?? 0,
          project_title: projectTitle,
        },
        user_id: user.id,
        user_name: userData?.name || "Unknown User",
      } as any);

      toast.success(`Notified ${(data as any)?.sent ?? 0} reviewer(s)`);
    } catch (e: any) {
      console.error("notify-reviewers failed", e);
      toast.error(e?.message || "Failed to notify reviewers");
    } finally {
      setNotifyingReviewers(false);
    }
  };

  const handleReadyForPublishing = async () => {
    if (!project || !user) return;
    setMarkingReady(true);
    try {
      // "Complete" maps to project status `approved`, which the tracker
      // WeekWorkflow already treats as Build-complete for linked projects.
      await handleStatusChange("approved");
      const { data: userData } = await supabase.from("users").select("name").eq("id", user.id).single();
      await supabase.from("timeline").insert({
        project_id: project.id,
        event_type: "ready_for_publishing" as any,
        event_details: { project_title: projectTitle },
        user_id: user.id,
        user_name: userData?.name || "Unknown User",
      } as any);
      toast.success("Project marked as Complete — linked tracker week will update");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to mark Ready for Publishing");
    } finally {
      setMarkingReady(false);
    }
  };

  const persistStage = async (stage: DraftStage, extraMeta?: Record<string, any>) => {
    if (!project) return;
    const metadata = { ...(project.metadata || {}), draft_stage: stage, ...(extraMeta || {}) };
    const { error } = await supabase
      .from("projects")
      .update({ metadata, updated_at: new Date().toISOString() } as any)
      .eq("id", project.id);
    if (error) throw error;
    setProject((prev) => (prev ? { ...prev, metadata } : prev));
    setDraftStage(stage);
  };

  const fetchBuilders = async () => {
    const { data } = await supabase
      .from("users")
      .select("id, name, email, content_roles, approval_status")
      .order("name");
    setBuilders(
      (data || [])
        .filter((u: any) => u.approval_status === "approved" && (u.content_roles || []).includes("builder"))
        .map((u: any) => ({ id: u.id, name: u.name, email: u.email }))
    );
  };

  const addDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const fmtDate = (s?: string) => (s ? formatDate(s) : "");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
      setIsAdmin((data as any)?.role === "admin");
    })();
  }, [user]);



  useEffect(() => {
    if (peerReviewerIds.length === 0) {
      setPeerReviewers([]);
      return;
    }
    (async () => {
      const { data } = await supabase.from("users").select("id, name").in("id", peerReviewerIds);
      setPeerReviewers((data || []).map((u: any) => ({ id: u.id, name: u.name })));
    })();
  }, [peerReviewerIds]);

  const handleDraftStageChange = async (stage: DraftStage) => {
    if (!project || !user) return;

    // Stg 2 requires the concept questionnaire — open it, revert to Stg 1 if unanswered
    if (stage === "s2_submit_concept") {
      setConceptAnswer(conceptNote?.answer ?? "");
      setConceptDueDate(conceptNote?.due_date || addDays(7));
      setConceptDialogOpen(true);
      return;
    }

    // Stg 5 requires picking two peer reviewers from the Builders team
    if (stage === "s5_submit_peer") {
      await fetchBuilders();
      setPeerSubmitNote(peerRequest?.note ?? "");
      setPeerDueDate(peerRequest?.due_date || addDays(4));
      setPeerDialogOpen(true);
      return;
    }


    setMarkingReady(true);
    try {
      if (stage === "s8_ready") {
        await persistStage(stage);
        await handleReadyForPublishing();
      } else {
        await persistStage(stage);
        if (stage !== "s9_published" && (currentStatus === "approved" || currentStatus === "published")) {
          await handleStatusChange("in_progress");
        }
        if (stage === "s9_published") {
          await handleStatusChange("published");
        }
        toast.success(`Draft status set to "${DRAFT_STAGES.find((s) => s.value === stage)?.label}"`);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to update draft status");
    } finally {
      setMarkingReady(false);
    }
  };

  const handleConceptDialogClose = (open: boolean) => {
    setConceptDialogOpen(open);
    // Cancelled without a saved questionnaire → stay/revert to Stg 1
    if (!open && !conceptNote?.answer && draftStage !== "s1_preparing") {
      persistStage("s1_preparing").catch(console.error);
    }
  };

  const handleSaveConceptNote = async () => {
    if (!project || !user) return;
    setSavingConcept(true);
    try {
      const { data: userData } = await supabase.from("users").select("name").eq("id", user.id).single();
      const note = {
        question: CONCEPT_QUESTION,
        answer: conceptAnswer.trim(),
        by: userData?.name || "Unknown User",
        at: new Date().toISOString(),
        due_date: conceptDueDate || addDays(7),
      };
      // Questionnaire filled → move straight to Stg 3
      const nextStage: DraftStage =
        draftStage === "s1_preparing" || draftStage === "s2_submit_concept" ? "s3_awaiting_concept" : draftStage;
      await persistStage(nextStage, { concept_note: note });
      setConceptNote(note);
      setConceptDialogOpen(false);
      try {
        await supabase.functions.invoke("notify-review-workflow", {
          body: {
            kind: "concept",
            projectId: project.id,
            dueDate: note.due_date,
            note: note.answer,
            submittedBy: note.by,
          },
        });
      } catch (mailErr) {
        console.error("Concept review email failed", mailErr);
      }
      toast.success("Concept submission saved — review awaited, notification sent");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to save concept note");
    } finally {
      setSavingConcept(false);
    }
  };

  const handleSaveConceptReview = async () => {
    if (!project || !user || !reviewOutcome) return;
    setSavingReview(true);
    try {
      const { data: userData } = await supabase.from("users").select("name").eq("id", user.id).single();
      const review: ConceptReview = {
        outcome: reviewOutcome as ConceptOutcome,
        comments: reviewComments.trim(),
        by: userData?.name || "Unknown User",
        at: new Date().toISOString(),
      };
      const nextStage: DraftStage =
        review.outcome === "Approved"
          ? "s4_concept_approved"
          : "s1_preparing";
      await persistStage(nextStage, { concept_review: review });
      setConceptReview(review);
      setReviewDialogOpen(false);
      toast.success(`Concept review recorded: ${review.outcome}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to save concept review");
    } finally {
      setSavingReview(false);
    }
  };

  const handleSavePeerReviewers = async () => {
    if (!project || peerReviewerIds.length !== 2) return;
    setSavingPeer(true);
    try {
      const request = { note: peerSubmitNote.trim(), due_date: peerDueDate || addDays(4) };
      await persistStage("s6_awaiting_peer", { peer_reviewer_ids: peerReviewerIds, peer_request: request });
      setPeerRequest(request);
      setPeerDialogOpen(false);
      try {
        const { data: me } = await supabase.from("users").select("name").eq("id", user?.id ?? "").maybeSingle();
        await supabase.functions.invoke("notify-review-workflow", {
          body: {
            kind: "peer",
            projectId: project.id,
            dueDate: request.due_date,
            note: request.note,
            submittedBy: (me as any)?.name,
            reviewerIds: peerReviewerIds,
          },
        });
      } catch (mailErr) {
        console.error("Peer review email failed", mailErr);
      }
      toast.success("Two peer reviewers assigned — status moved to Stg 6");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to assign peer reviewers");
    } finally {
      setSavingPeer(false);
    }
  };

  const handleAdminDelete = async (what: "concept" | "outcome" | "peer") => {
    if (!project) return;
    try {
      if (what === "concept") {
        await persistStage(draftStage, { concept_note: null });
        setConceptNote(null);
        setConceptAnswer("");
      } else if (what === "outcome") {
        await persistStage(draftStage, { concept_review: null });
        setConceptReview(null);
      } else {
        await persistStage(draftStage, { peer_reviews: [] });
        setPeerReviews([]);
      }
      toast.success("Deleted");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to delete");
    }
  };



  const handleAddPeerReview = async () => {
    if (!project || !user || !peerCommentText.trim()) return;
    setSavingPeerComment(true);
    try {
      const { data: userData } = await supabase.from("users").select("name").eq("id", user.id).single();
      const entry: PeerReviewEntry = {
        comments: peerCommentText.trim(),
        by: userData?.name || "Unknown User",
        byId: user.id,
        at: new Date().toISOString(),
        approved: isAdmin && peerCommentApproved,
      };
      const next = [...peerReviews, entry];
      // Peer review is done once every assigned reviewer has commented,
      // OR an admin has recorded an "Approved" comment.
      const reviewed = new Set(next.map((p) => p.byId).filter(Boolean) as string[]);
      const allReviewed =
        peerReviewerIds.length > 0 && peerReviewerIds.every((id) => reviewed.has(id));
      const adminApproved = next.some((p) => p.approved);
      const nextStage: DraftStage =
        (allReviewed || adminApproved) && draftStage === "s6_awaiting_peer" ? "s7_peer_done" : draftStage;
      await persistStage(nextStage, { peer_reviews: next });
      setPeerReviews(next);
      setPeerCommentText("");
      setPeerCommentApproved(false);
      setPeerCommentDialogOpen(false);
      toast.success(
        nextStage !== draftStage
          ? "Peer review complete — status moved to Stg 7"
          : "Peer review comment added"
      );
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to add peer review comment");
    } finally {
      setSavingPeerComment(false);
    }
  };



  // Determine if publish button should be shown
  const showPublishButton =
    project?.type === "article" ||
    project?.type === "document" ||
    (project?.metadata as any)?.goal === "substack_newsletter" ||
    (project?.metadata as any)?.goal === "substack_article" ||
    (project?.metadata as any)?.goal === "wordpress_blog" ||
    (project?.metadata as any)?.goal === "wordpress_post" ||
    (project?.metadata as any)?.goal === "book_article" ||
    (project?.metadata as any)?.goal === "other";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-subtle ml-14">
      {/* Page Navigation Banner */}
      <PageNavigationBanner
        title="Edit and Refine"
        leftLabel="Bring ideas and create first draft"
        leftPath={`/project/${projectId}/intake`}
        rightLabel="Publish"
        rightPath={`/publish/${projectId}`}
      />

      {/* Project name (under banner title) */}
      <div className="border-b bg-card/60">
        <div className="container mx-auto px-4 py-1.5 text-center">
          <Input
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            readOnly={editLocked}
            placeholder="Project title"
            className="font-bold text-xl md:text-2xl max-w-3xl mx-auto text-center border-transparent hover:border-input focus-visible:border-input bg-transparent h-11"
          />
          {editLocked && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
              This draft is locked for editing (Stg 9 onwards). Only admins can make changes.
            </p>
          )}
          {linkedEntry && (
            <div className="mt-2 flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-400 text-white px-4 py-1.5 text-sm font-medium shadow-sm">
                <CalendarIcon className="h-4 w-4" />
                Included in the plan to publish during Week {weeksOfYear(new Date(linkedEntry.week_start_date + "T00:00:00Z").getUTCFullYear()).indexOf(linkedEntry.week_start_date) + 1} ({weekRangeLabel(linkedEntry.week_start_date)}) · Build due: {formatDate(linkedEntry.build_due_date)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Bar */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-end gap-3 flex-wrap">
            <Button onClick={() => navigate(`/tracker?project=${project.id}`)} variant="outline" className="gap-2">
              Tracker
            </Button>
            <Button onClick={handleSaveCurrentVersion} disabled={saving || editLocked} variant="outline" className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Project"}
            </Button>


            <AssignDialog projectId={project.id} versionId={currentVersionId} />

            {user && (
              <NotifyReviewersDialog
                projectId={project.id}
                versionId={currentVersionId}
                requesterId={user.id}
                projectTitle={projectTitle}
              />
            )}

            {showPublishButton && (
              <>
                <Button onClick={() => navigate(`/publish/${projectId}`)} variant="outline" className="gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Export
                </Button>
                <div className="flex items-center gap-2 border rounded-md px-2 py-1 bg-background">
                  <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={draftStage}
                    onValueChange={(v) => handleDraftStageChange(v as DraftStage)}
                    disabled={markingReady}
                  >
                    <SelectTrigger className="h-7 border-0 bg-transparent px-1 text-sm w-[290px] focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DRAFT_STAGES.map((s) => (
                        <SelectItem
                          key={s.value}
                          value={s.value}
                          disabled={AUTO_STAGES.includes(s.value)}
                        >
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

              </>
            )}


            <InviteDialog projectId={project.id} projectOwnerId={project.owner_id} currentUserId={user?.id || ""} />

            <Button variant="outline" size="icon" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Versions / Timeline / Comments as tabs */}
        <div
          className={`flex-shrink-0 border-r bg-card overflow-hidden hidden md:flex flex-col transition-all duration-200 ${
            leftPanel ? "w-72 lg:w-80" : "w-10"
          }`}
        >
          {leftPanel ? (
            <>
              <div className="flex items-stretch border-b text-xs font-medium">
                {([
                  ["comments", "Review Comments"],
                  ["versions", "Versions"],
                  ["timeline", "Activity Timeline"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setLeftPanel(key)}
                    className={`flex-1 px-2 py-2 border-r last:border-r-0 transition-colors ${
                      leftPanel === key ? "bg-background text-foreground" : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => setLeftPanel(null)}
                  className="px-2 py-2 hover:bg-muted text-muted-foreground border-l"
                  title="Collapse panel"
                >
                  <ChevronDown className="h-3.5 w-3.5 rotate-90" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {leftPanel === "comments" && (
                  <CommentsPanel projectId={project.id} versionId={currentVersionId} />
                )}
                {leftPanel === "versions" && (
                  <div className="flex flex-col">
                    <VersionsSidebar projectId={project.id} onVersionSelect={handleVersionSelect} />
                    <ProjectImagesSection projectId={project.id} userId={user?.id} />
                  </div>
                )}
                {leftPanel === "timeline" && <TimelineFeed projectId={project.id} />}
              </div>
            </>
          ) : (
            <div className="flex flex-col h-full">
              {([
                ["comments", "Review Comments"],
                ["versions", "Versions"],
                ["timeline", "Activity Timeline"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setLeftPanel(key)}
                  className="flex-1 border-b hover:bg-muted text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-center"
                  title={`Open ${label}`}
                >
                  <span className="[writing-mode:vertical-rl]">{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>


        {/* Center - Editor/Preview */}
        <div className="flex-1 min-w-0 overflow-hidden bg-background flex flex-col">

          {/* Edit/Preview Toggle */}
          <div className="border-b bg-muted/30 px-4 py-2 flex items-center gap-2">
            <Button
              variant={viewMode === "edit" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("edit")}
              className="gap-2"
            >
              <Code className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant={viewMode === "preview" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("preview")}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              Preview
            </Button>
            <Button
              onClick={async () => {
                const name = window.prompt("Name for the new version:", `Version ${formatDateTime(new Date())}`);
                if (name && name.trim()) await handleSaveAsNewVersion(name.trim());
              }}
              disabled={saving || editLocked}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              Save in new version
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled
              title="Temporarily deactivated"
              className="gap-2 ml-2"
            >
              <ImageIcon className="h-4 w-4" />
              Generate an image for the article
            </Button>

            {project && user && (
              <AddImageDialog
                projectId={project.id}
                userId={user.id}
                onUploaded={(img) => setHeroImage(img)}
              />
            )}

            {/* Font size selector on the newsletter */}
            <div className="ml-auto flex items-center gap-1 border rounded-md px-2 py-1 bg-background">
              <Type className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={fontSize} onValueChange={(v) => setFontSize(v as any)}>
                <SelectTrigger className="h-7 border-0 bg-transparent px-1 text-xs w-[90px] focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">Small</SelectItem>
                  <SelectItem value="base">Normal</SelectItem>
                  <SelectItem value="lg">Large</SelectItem>
                  <SelectItem value="xl">X-Large</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {project && user && (
            <GenerateImageDialog
              open={showImageDialog}
              onOpenChange={setShowImageDialog}
              projectId={project.id}
              userId={user.id}
              defaultPrompt={`generate cover image which can go with this article in the substack newsletter\n\nArticle text:\n${markdownContent}`}
            />
          )}

          {/* Review box — Concept Review, Outcome and Peer Review (collapsible) */}
          {(conceptNote?.answer || conceptReview || peerReviewers.length > 0 || peerReviews.length > 0) && (
            <div className="border-b px-8 py-3">
              <div className="rounded-lg border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setReviewBoxOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2 bg-muted/60 hover:bg-muted transition-colors"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Review
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${reviewBoxOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {reviewBoxOpen && (
                  <div className="max-h-[45vh] overflow-y-auto">
                    {/* Concept Review panel */}
                    <div className="bg-amber-50 dark:bg-amber-950/20 px-4 py-3 border-t">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Concept Review
                      </p>
                      <p className="text-sm font-medium mt-1">{CONCEPT_QUESTION}</p>
                      <p className="text-sm whitespace-pre-wrap mt-1">
                        {conceptNote?.answer || <span className="text-muted-foreground italic">Not answered yet</span>}
                      </p>
                      {conceptNote?.due_date && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Review due by {fmtDate(conceptNote.due_date)}
                        </p>
                      )}
                      {conceptNote?.by && (
                        <p className="text-xs text-muted-foreground mt-1">
                          — {conceptNote.by}
                          {conceptNote.at ? ` on ${formatDateTime(conceptNote.at)}` : ""}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setConceptAnswer(conceptNote?.answer ?? "");
                            setConceptDueDate(conceptNote?.due_date || addDays(7));
                            setConceptDialogOpen(true);
                          }}
                        >
                          {conceptNote?.answer ? "Edit submission" : "Answer"}
                        </Button>
                        {isAdmin && conceptNote?.answer && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleAdminDelete("concept")}>
                            Delete submission
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Outcome panel */}
                    <div className="bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 border-t">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Outcome
                      </p>
                      {conceptReview ? (
                        <div className="mt-1">
                          <p className="text-sm">
                            <span className="font-medium">Outcome:</span> {conceptReview.outcome}
                          </p>
                          {conceptReview.comments && (
                            <p className="text-sm whitespace-pre-wrap mt-1">{conceptReview.comments}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            — {conceptReview.by}
                            {conceptReview.at ? ` on ${formatDateTime(conceptReview.at)}` : ""}
                          </p>
                        </div>
                      ) : conceptNote?.answer ? (
                        <p className="text-sm mt-1">
                          <span className="font-medium">Outcome:</span> Awaited
                          {conceptNote.due_date ? ` — due by ${fmtDate(conceptNote.due_date)}` : ""}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic mt-1">Not reviewed yet</p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReviewComments(conceptReview?.comments ?? "");
                            setReviewOutcome(conceptReview?.outcome ?? "");
                            setReviewDialogOpen(true);
                          }}
                        >
                          {conceptReview ? "Edit Review Outcome" : "Review Concept"}
                        </Button>
                        {isAdmin && conceptReview && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleAdminDelete("outcome")}>
                            Delete outcome
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Peer Review panel */}
                    <div className="bg-sky-50 dark:bg-sky-950/20 px-4 py-3 border-t">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Peer Review
                          </p>
                          {peerReviewers.length > 0 && (
                            <p className="text-sm mt-1">
                              <span className="font-medium">Reviewers:</span>{" "}
                              {peerReviewers.map((r) => r.name).join(", ")}
                            </p>
                          )}
                          {peerRequest?.note && (
                            <p className="text-sm whitespace-pre-wrap mt-1">{peerRequest.note}</p>
                          )}
                          {peerRequest?.due_date && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Peer review due by {fmtDate(peerRequest.due_date)}
                            </p>
                          )}
                          {peerReviews.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic mt-1">No peer review comments yet</p>
                          ) : (
                            <div className="mt-2 space-y-2">
                              {peerReviews.map((pr, i) => (
                                <div key={i} className="border-t pt-2">
                                  <p className="text-sm whitespace-pre-wrap">{pr.comments}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    — {pr.by}
                                    {pr.at ? ` on ${formatDateTime(pr.at)}` : ""}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!peerReviewUnlocked}
                            title={peerReviewUnlocked ? undefined : "Available once the project reaches Stg 5. Submit for Peer Review"}
                            onClick={() => { setPeerCommentText(""); setPeerCommentDialogOpen(true); }}
                          >
                            Add Peer Review / Respond to review comments
                          </Button>
                          {!peerReviewUnlocked && (
                            <p className="text-[11px] text-muted-foreground max-w-[220px] text-right">
                              Unlocks at Stg 5. Submit for Peer Review
                            </p>
                          )}
                          {isAdmin && peerReviews.length > 0 && (
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleAdminDelete("peer")}>
                              Delete peer review comments
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}



          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">

            {loadingContent ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="text-sm text-muted-foreground">Loading content...</p>
                </div>
              </div>
            ) : viewMode === "edit" ? (
              <div className="flex flex-col h-full">
                <Textarea
                  ref={textareaRef}
                  value={markdownContent}
                  readOnly={editLocked}
                  onChange={(e) => { if (!editLocked) setMarkdownContent(e.target.value); }}

                  onSelect={handleTextSelection}
                  onMouseUp={handleTextSelection}
                  onKeyUp={handleTextSelection}
                  className={`w-full flex-1 min-h-[500px] p-8 resize-none border-none focus-visible:ring-0 font-mono leading-relaxed ${fontSize === "sm" ? "text-sm" : fontSize === "lg" ? "text-lg" : fontSize === "xl" ? "text-xl" : "text-base"}`}
                  placeholder="Start writing your content here..."
                  style={{ whiteSpace: "pre-wrap" }}
                />
              </div>
            ) : (
              <div className="p-8 max-w-4xl mx-auto">
                <article className={`prose max-w-none dark:prose-invert prose-headings:font-bold prose-p:leading-relaxed ${fontSize === "sm" ? "prose-sm" : fontSize === "lg" ? "prose-lg" : fontSize === "xl" ? "prose-xl" : "prose-base"}`}>
                  <ReactMarkdown>{markdownContent}</ReactMarkdown>
                </article>

              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - AI Tools & Feedback (collapsible, default collapsed) */}
        <div
          className={`relative flex-shrink-0 border-l bg-card overflow-hidden hidden lg:block transition-all duration-200 ${
            sidebarOpen ? "w-80 xl:w-96" : "w-10"
          }`}
        >
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="absolute top-2 left-1 z-10 p-1.5 rounded hover:bg-muted text-muted-foreground"
            title={sidebarOpen ? "Collapse AI panel" : "Expand AI panel"}
          >
            {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
          {sidebarOpen ? (
            <div className="pl-8 h-full">
              <WorkspaceSidebar
                projectId={project.id}
                selectedText={selectedText}
                onInsertText={handleInsertText}
                editorRef={editorRef}
                projectMetadata={project.metadata}
                markdownContent={markdownContent}
                onContentUpdate={setMarkdownContent}
              />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-start pt-12 text-[10px] text-muted-foreground uppercase tracking-wider">
              <span className="[writing-mode:vertical-rl] rotate-180">AI Feedback & Tools</span>
            </div>
          )}
        </div>
      </div>

      {/* Concept Review Questionnaire */}
      <Dialog open={conceptDialogOpen} onOpenChange={handleConceptDialogClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Concept Review Submission</DialogTitle>
            <DialogDescription>{CONCEPT_QUESTION}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={conceptAnswer}
            onChange={(e) => setConceptAnswer(e.target.value)}
            rows={6}
            placeholder="Write your response for the reviewers..."
          />
          <div className="space-y-1">
            <label className="text-sm font-medium">Review due date</label>
            <Input type="date" value={conceptDueDate} onChange={(e) => setConceptDueDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">Defaults to 7 days from submission.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleConceptDialogClose(false)} disabled={savingConcept}>
              Cancel
            </Button>
            <Button onClick={handleSaveConceptNote} disabled={savingConcept || !conceptAnswer.trim()}>
              {savingConcept ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Concept outcome */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Concept</DialogTitle>
            <DialogDescription>Record your review comments and the outcome.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={reviewComments}
              onChange={(e) => setReviewComments(e.target.value)}
              rows={5}
              placeholder="Review comments..."
            />
            <Select value={reviewOutcome} onValueChange={(v) => setReviewOutcome(v as ConceptOutcome)}>
              <SelectTrigger>
                <SelectValue placeholder="Select review outcome" />
              </SelectTrigger>
              <SelectContent>
                {CONCEPT_OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)} disabled={savingReview}>
              Cancel
            </Button>
            <Button onClick={handleSaveConceptReview} disabled={savingReview || !reviewOutcome}>
              {savingReview ? "Saving..." : "Save review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Peer reviewer assignment */}
      <Dialog open={peerDialogOpen} onOpenChange={setPeerDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit for Peer Review</DialogTitle>
            <DialogDescription>Select exactly two reviewers from the Builders team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {builders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Builders available.</p>
            ) : (
              builders.map((b) => {
                const checked = peerReviewerIds.includes(b.id);
                return (
                  <label key={b.id} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && peerReviewerIds.length >= 2}
                      onChange={(e) =>
                        setPeerReviewerIds((prev) =>
                          e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id)
                        )
                      }
                    />
                    <span>{b.name} ({b.email})</span>
                  </label>
                );
              })
            )}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Notes for reviewers</label>
            <Textarea
              value={peerSubmitNote}
              onChange={(e) => setPeerSubmitNote(e.target.value)}
              rows={3}
              placeholder="What should the peer reviewers focus on?"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Peer review due date</label>
            <Input type="date" value={peerDueDate} onChange={(e) => setPeerDueDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">Defaults to 4 days from submission.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPeerDialogOpen(false)} disabled={savingPeer}>
              Cancel
            </Button>
            <Button onClick={handleSavePeerReviewers} disabled={savingPeer || peerReviewerIds.length !== 2}>
              {savingPeer ? "Saving..." : "Assign & move to Stg 6"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Peer review comment */}
      <Dialog open={peerCommentDialogOpen} onOpenChange={setPeerCommentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Peer Review / Respond to review comments</DialogTitle>
            <DialogDescription>Your comments will appear in the Peer Review section.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={peerCommentText}
            onChange={(e) => setPeerCommentText(e.target.value)}
            rows={5}
            placeholder="Peer review comments..."
          />
          {isAdmin && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={peerCommentApproved}
                onChange={(e) => setPeerCommentApproved(e.target.checked)}
              />
              Record this as an admin <b>Approved</b> comment (completes peer review)
            </label>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPeerCommentDialogOpen(false)} disabled={savingPeerComment}>
              Cancel
            </Button>
            <Button onClick={handleAddPeerReview} disabled={savingPeerComment || !peerCommentText.trim()}>
              {savingPeerComment ? "Saving..." : "Add comment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{projectTitle}"? This action cannot be undone and will delete all
              versions, comments, and related data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Workspace;
