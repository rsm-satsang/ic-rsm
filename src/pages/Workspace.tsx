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
import { ArrowLeft, Save, Settings, Trash2, CheckCircle, Eye, Code, MessageSquare, ListTodo, ImageIcon, Send, FileCheck2, PanelRightOpen, PanelRightClose } from "lucide-react";
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

interface Project {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: "draft" | "in_progress" | "review" | "approved" | "published";
  owner_id: string;
  metadata?: any;
}

const Workspace = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
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
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg" | "xl">("base");

  const [showImageDialog, setShowImageDialog] = useState(false);
  const [markdownContent, setMarkdownContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(true);
  const [heroImage, setHeroImage] = useState<{ url: string; caption: string | null } | null>(null);
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

  useAutosave(projectTitle, autosaveTitle, 1500, !!project && !!user);

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

  useAutosave(markdownContent, autosaveContent, 2000, !!project && !!user && !!currentVersionId);

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
        .select("image_url, prompt")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setHeroImage(data ? { url: data.image_url, caption: data.prompt } : null);
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
            placeholder="Project title"
            className="font-medium text-sm max-w-md mx-auto text-center border-transparent hover:border-input focus-visible:border-input bg-transparent h-7"
          />
        </div>
      </div>

      {/* Top Bar */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-end gap-3 flex-wrap">
            <Button onClick={handleSaveCurrentVersion} disabled={saving} className="gap-2">
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
                <Button
                  onClick={handleReadyForPublishing}
                  disabled={markingReady || currentStatus === "approved" || currentStatus === "published"}
                  variant="default"
                  className="gap-2"
                >
                  <FileCheck2 className="h-4 w-4" />
                  {currentStatus === "approved" || currentStatus === "published"
                    ? "Complete"
                    : markingReady
                      ? "Marking..."
                      : "Ready for Publishing"}
                </Button>
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
        {/* Left Sidebar - Versions (collapsible, default collapsed) + Images */}
        <div
          className={`flex-shrink-0 border-r bg-card overflow-hidden hidden md:flex flex-col transition-all duration-200 ${
            versionsOpen ? "w-56 lg:w-64" : "w-10"
          }`}
        >
          <button
            onClick={() => setVersionsOpen((v) => !v)}
            className="p-2 border-b hover:bg-muted text-muted-foreground flex items-center justify-center"
            title={versionsOpen ? "Collapse versions" : "Expand versions"}
          >
            {versionsOpen ? <PanelRightOpen className="h-4 w-4 rotate-180" /> : <PanelRightClose className="h-4 w-4 rotate-180" />}
          </button>
          {versionsOpen ? (
            <div className="flex-1 overflow-y-auto flex flex-col">
              <VersionsSidebar projectId={project.id} onVersionSelect={handleVersionSelect} />
              <ProjectImagesSection projectId={project.id} />
            </div>
          ) : (
            <div className="flex-1 flex items-start justify-center pt-4 text-[10px] text-muted-foreground uppercase tracking-wider">
              <span className="[writing-mode:vertical-rl]">Versions</span>
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
                const name = window.prompt("Name for the new version:", `Version ${new Date().toLocaleString()}`);
                if (name && name.trim()) await handleSaveAsNewVersion(name.trim());
              }}
              disabled={saving}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              Save in new version
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={() => setShowImageDialog(true)}
              className="gap-2 ml-2"
            >
              <ImageIcon className="h-4 w-4" />
              Generate an image for the article
            </Button>
            {project && user && <AddImageDialog projectId={project.id} userId={user.id} />}
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
                {heroImage && (
                  <div className="px-8 pt-6">
                    <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
                      <img src={heroImage.url} alt={heroImage.caption || "Article image"} className="w-full max-h-80 object-cover" />
                      {heroImage.caption && (
                        <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/30">{heroImage.caption}</div>
                      )}
                    </div>
                  </div>
                )}
                <Textarea
                  ref={textareaRef}
                  value={markdownContent}
                  onChange={(e) => setMarkdownContent(e.target.value)}
                  onSelect={handleTextSelection}
                  onMouseUp={handleTextSelection}
                  onKeyUp={handleTextSelection}
                  className="w-full flex-1 min-h-[500px] p-8 resize-none border-none focus-visible:ring-0 font-mono text-sm leading-relaxed"
                  placeholder="Start writing your content here..."
                  style={{ whiteSpace: "pre-wrap" }}
                />
              </div>
            ) : (
              <div className="p-8 max-w-4xl mx-auto">
                {heroImage && (
                  <div className="mb-6 border rounded-lg overflow-hidden bg-card shadow-sm">
                    <img src={heroImage.url} alt={heroImage.caption || "Article image"} className="w-full max-h-96 object-cover" />
                    {heroImage.caption && (
                      <div className="px-4 py-2 text-sm text-muted-foreground border-t bg-muted/30">{heroImage.caption}</div>
                    )}
                  </div>
                )}
                <article className="prose prose-lg max-w-none dark:prose-invert prose-headings:font-bold prose-p:leading-relaxed">
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

      {/* Bottom Bar - Activity Timeline + Comments tabs */}
      <div className="border-t bg-card">
        <Tabs defaultValue="timeline" className="w-full">
          <TabsList className="h-9 mx-3 mt-2 bg-muted rounded-md">
            <TabsTrigger value="timeline" className="text-xs px-3">Activity Timeline</TabsTrigger>
            <TabsTrigger value="comments" className="text-xs px-3">Add Review Comments</TabsTrigger>
          </TabsList>
          <TabsContent value="timeline" className="m-0">
            <TimelineFeed projectId={project.id} />
          </TabsContent>
          <TabsContent value="comments" className="m-0">
            <div className="h-64">
              <CommentsPanel projectId={project.id} versionId={currentVersionId} />
            </div>
          </TabsContent>
        </Tabs>
      </div>


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
