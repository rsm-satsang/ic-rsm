import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import AIToolsPanel from "./AIToolsPanel";
import AIFeedbackPanel from "./AIFeedbackPanel";

interface WorkspaceSidebarProps {
  projectId: string;
  selectedText: string;
  onInsertText: (text: string, aiFeatureName: string) => Promise<void>;
  editorRef?: any;
  projectMetadata?: any;
  markdownContent?: string;
  onContentUpdate?: (newContent: string) => void;
}

export const WorkspaceSidebar = ({
  projectId,
  selectedText,
  onInsertText,
  editorRef,
  projectMetadata,
  markdownContent,
  onContentUpdate,
}: WorkspaceSidebarProps) => {
  const [openPanel, setOpenPanel] = useState<"feedback" | "ai" | null>(null);

  const toggle = (p: "feedback" | "ai") => setOpenPanel((cur) => (cur === p ? null : p));

  return (
    <div className="flex flex-col h-full w-full">
      <div className="border-b flex-shrink-0">
        <button
          onClick={() => toggle("feedback")}
          className="w-full flex items-center justify-between px-3 py-3 text-xs font-medium hover:bg-muted/40 transition-colors"
        >
          <span>AI Feedback</span>
          {openPanel === "feedback" ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        {openPanel === "feedback" && (
          <div className="border-t max-h-[45vh] overflow-y-auto">
            <AIFeedbackPanel
              projectId={projectId}
              editorRef={editorRef}
              projectMetadata={projectMetadata}
              previewContent={markdownContent}
              onContentUpdate={onContentUpdate}
            />
          </div>
        )}
      </div>

      <div className="border-b flex-shrink-0">
        <button
          onClick={() => toggle("ai")}
          className="w-full flex items-center justify-between px-3 py-3 text-xs font-medium hover:bg-muted/40 transition-colors"
        >
          <span>AI Tools</span>
          {openPanel === "ai" ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        {openPanel === "ai" && (
          <div className="border-t flex-1 overflow-y-auto">
            <AIToolsPanel
              projectId={projectId}
              selectedText={selectedText}
              onInsertText={onInsertText}
            />
          </div>
        )}
      </div>

      {!openPanel && (
        <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-muted-foreground">
          Expand a panel above to open AI Feedback or AI Tools.
        </div>
      )}
    </div>
  );
};
