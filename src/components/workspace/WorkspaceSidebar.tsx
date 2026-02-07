import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  onContentUpdate 
}: WorkspaceSidebarProps) => {
  return (
    <Tabs defaultValue="feedback" className="flex flex-col h-full w-full">
      <TabsList className="w-full grid grid-cols-2 h-auto p-0 bg-transparent border-b rounded-none flex-shrink-0">
        <TabsTrigger 
          value="feedback" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-muted/30 py-3 text-xs"
        >
          AI Feedback
        </TabsTrigger>
        <TabsTrigger 
          value="ai" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-muted/30 py-3 text-xs"
        >
          AI Tools
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="feedback" className="flex-1 m-0 border-0 focus-visible:ring-0 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <AIFeedbackPanel
            projectId={projectId}
            editorRef={editorRef}
            projectMetadata={projectMetadata}
            previewContent={markdownContent}
            onContentUpdate={onContentUpdate}
          />
        </div>
      </TabsContent>
      
      <TabsContent value="ai" className="flex-1 m-0 border-0 focus-visible:ring-0 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <AIToolsPanel
            projectId={projectId}
            selectedText={selectedText}
            onInsertText={onInsertText}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
};
