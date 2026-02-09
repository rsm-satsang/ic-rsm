import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft, Download, Copy } from "lucide-react";
import AIFeedbackPanel from "@/components/workspace/AIFeedbackPanel";
import PageNavigationBanner from "@/components/ui/PageNavigationBanner";
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

const PublishPreview = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [reviewedFeedback, setReviewedFeedback] = useState(false);
  const [readyToPublish, setReadyToPublish] = useState(false);

  useEffect(() => {
    checkUserAndLoadProject();
  }, [projectId]);

  const checkUserAndLoadProject = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (!currentUser) {
        navigate("/auth");
        return;
      }

      setUser(currentUser);

      if (projectId) {
        await loadProject(projectId);
        await loadLatestVersion(projectId);
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
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setProject(data);
    } catch (error: any) {
      toast.error("Failed to load project");
      console.error(error);
      navigate("/dashboard");
    }
  };

  const loadLatestVersion = async (projectId: string) => {
    try {
      const { data, error } = await supabase
        .from("versions")
        .select("content")
        .eq("project_id", projectId)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      
      // Convert HTML to plain text preserving exact newlines
      const htmlContent = data.content || "";
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = htmlContent;
      
      // Replace br with newlines
      tempDiv.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
      
      // Add proper spacing for block elements
      tempDiv.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote").forEach((el) => {
        el.prepend("\n\n");
      });
      
      const plainText = (tempDiv.textContent || "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      
      setMarkdownContent(plainText);
    } catch (error: any) {
      console.error("Failed to load version:", error);
      toast.error("Failed to load content");
    }
  };

  const handleCopyToPublish = async () => {
    if (!project || !user || !markdownContent) {
      toast.error("No content to copy");
      return;
    }

    try {
      // Add title at the top and copy as markdown
      const contentToPublish = `# ${project.title}\n\n${markdownContent}`;
      
      // Copy to clipboard
      await navigator.clipboard.writeText(contentToPublish);
      
      toast.success("Markdown copied to clipboard!", {
        description: "Ready to paste into Substack or your publishing platform.",
        duration: 6000,
      });

      // Log to timeline
      const { data: userData } = await supabase
        .from("users")
        .select("name")
        .eq("id", user.id)
        .single();

      await supabase.from("timeline").insert({
        project_id: project.id,
        event_type: "edited",
        event_details: { 
          action: "copied_to_publish_from_preview"
        },
        user_id: user.id,
        user_name: userData?.name || "Unknown User",
      });

    } catch (error: any) {
      console.error("Copy failed:", error);
      toast.error(error?.message || "Failed to copy content");
    }
  };

  const handleExport = async () => {
    if (!project || !markdownContent) {
      toast.error("No content to export");
      return;
    }

    try {
      const contentToExport = `# ${project.title}\n\n${markdownContent}`;
      
      // Create a blob and download as .txt file (which can be opened as markdown)
      const blob = new Blob([contentToExport], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success("Content exported successfully!", {
        description: "Markdown file downloaded. Can be converted to PDF or Word.",
      });

      // Log to timeline
      if (user) {
        const { data: userData } = await supabase
          .from("users")
          .select("name")
          .eq("id", user.id)
          .single();

        await supabase.from("timeline").insert({
          project_id: project.id,
          event_type: "edited",
          event_details: { 
            action: "exported_from_preview"
          },
          user_id: user.id,
          user_name: userData?.name || "Unknown User",
        });
      }

    } catch (error: any) {
      console.error("Export failed:", error);
      toast.error(error?.message || "Failed to export content");
    }
  };

  const bothCheckboxesChecked = reviewedFeedback && readyToPublish;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-subtle">
      {/* Page Navigation Banner */}
      <PageNavigationBanner
        title="publish"
        leftLabel="edit and refine"
        leftPath={`/workspace/${projectId}`}
      />

      {/* Top Bar */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-semibold">Publish Preview</h1>
            <div className="text-lg font-medium text-muted-foreground">
              {project.title}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Preview Area */}
        <div className="flex-1 overflow-y-auto bg-background p-8">
          <div className="max-w-4xl mx-auto">
            <article className="prose prose-lg max-w-none dark:prose-invert prose-headings:font-bold prose-p:leading-relaxed">
              <ReactMarkdown>{markdownContent}</ReactMarkdown>
            </article>
          </div>
        </div>

        {/* Right Sidebar - AI Feedback */}
        <div className="w-80 lg:w-96 flex-shrink-0 border-l bg-card overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">AI Feedback</h2>
            <AIFeedbackPanel
              projectId={project.id}
              editorRef={null}
              projectMetadata={project.metadata}
              previewContent={markdownContent}
              isPreviewMode={true}
            />
          </div>
        </div>
      </div>

      {/* Bottom Checklist and Action Bar */}
      <div className="border-t bg-card p-6">
        <div className="container mx-auto max-w-4xl space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <Checkbox 
                id="reviewed-feedback" 
                checked={reviewedFeedback}
                onCheckedChange={(checked) => setReviewedFeedback(checked === true)}
              />
              <label
                htmlFor="reviewed-feedback"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Reviewed feedback
              </label>
            </div>
            <div className="flex items-center space-x-3">
              <Checkbox 
                id="ready-to-publish" 
                checked={readyToPublish}
                onCheckedChange={(checked) => setReadyToPublish(checked === true)}
              />
              <label
                htmlFor="ready-to-publish"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Completed all editing, Ready to publish
              </label>
            </div>
          </div>

          {bothCheckboxesChecked && (
            <div className="flex gap-3 pt-2">
              <Button 
                onClick={handleExport}
                variant="outline"
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button 
                onClick={handleCopyToPublish}
                className="gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy to Publish
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublishPreview;
