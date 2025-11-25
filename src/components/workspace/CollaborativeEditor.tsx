import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Quote,
  Undo,
  Redo,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CollaborativeEditorProps {
  projectId: string;
  userId: string;
  onTextSelection?: (text: string) => void;
  onEditorReady?: (editor: any) => void;
  onVersionChange?: (versionId: string | null) => void;
  selectedVersionId?: string | null;
}

const CollaborativeEditor = ({ projectId, userId, onTextSelection, onEditorReady, onVersionChange, selectedVersionId }: CollaborativeEditorProps) => {
  const [content, setContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(true);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose lg:prose-lg xl:prose-xl prose-headings:font-bold prose-h1:text-4xl prose-h1:mb-4 prose-h2:text-3xl prose-h2:mb-3 prose-h3:text-2xl prose-h3:mb-2 prose-strong:font-bold prose-strong:text-foreground focus:outline-none min-h-[500px] max-w-full w-full p-8 dark:prose-invert",
      },
    },
    onUpdate: ({ editor }) => {
      setContent(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, ' ');
      if (onTextSelection && text.trim()) {
        onTextSelection(text);
      }
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (selectedVersionId) {
      loadSpecificVersion(selectedVersionId);
    } else {
      loadLatestVersion();
    }
  }, [projectId, selectedVersionId, editor]);

  const loadLatestVersion = async () => {
    if (!editor) return;
    
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
        if (onVersionChange) {
          onVersionChange(data.id);
        }
        editor.commands.setContent(data.content || "<p>Start writing your content here...</p>");
      } else {
        // No versions exist yet
        setCurrentVersionId(null);
        if (onVersionChange) {
          onVersionChange(null);
        }
        editor.commands.setContent("<p>Start writing your content here...</p>");
      }
    } catch (error) {
      console.error("Error loading content:", error);
    } finally {
      setLoadingContent(false);
    }
  };

  const loadSpecificVersion = async (versionId: string) => {
    if (!editor) return;
    
    try {
      setLoadingContent(true);
      const { data, error } = await supabase
        .from("versions")
        .select("id, content")
        .eq("id", versionId)
        .single();

      if (error) throw error;

      if (data) {
        setCurrentVersionId(data.id);
        if (onVersionChange) {
          onVersionChange(data.id);
        }
        editor.commands.setContent(data.content || "<p>Start writing your content here...</p>");
        toast.success("Version loaded successfully!");
      }
    } catch (error) {
      console.error("Error loading specific version:", error);
      toast.error("Failed to load version");
    } finally {
      setLoadingContent(false);
    }
  };

  if (!editor) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (loadingContent) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading content...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="border-b bg-muted/30 px-4 py-2 sticky top-0 z-10">
        <div className="flex items-center gap-1 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive("bold") ? "bg-muted" : ""}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive("italic") ? "bg-muted" : ""}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={editor.isActive("heading", { level: 2 }) ? "bg-muted" : ""}
          >
            <Heading2 className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive("bulletList") ? "bg-muted" : ""}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive("orderedList") ? "bg-muted" : ""}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={editor.isActive("blockquote") ? "bg-muted" : ""}
          >
            <Quote className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
          >
            <Undo className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
          >
            <Redo className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto bg-background w-full">
        <EditorContent editor={editor} className="h-full w-full" />
      </div>
    </div>
  );
};

export default CollaborativeEditor;
