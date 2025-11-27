import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReferenceSidebar } from "./ReferenceSidebar";
import AIToolsPanel from "./AIToolsPanel";
import AIFeedbackPanel from "./AIFeedbackPanel";

interface WorkspaceSidebarProps {
  projectId: string;
  selectedText: string;
  onInsertText: (text: string, aiFeatureName: string) => Promise<void>;
  editorRef?: any;
  projectMetadata?: any;
}

export const WorkspaceSidebar = ({ projectId, selectedText, onInsertText, editorRef, projectMetadata }: WorkspaceSidebarProps) => {
  return (
    <Tabs defaultValue="ai" className="flex flex-col h-full w-full">
      <TabsList className="w-full grid grid-cols-3 h-auto p-0 bg-transparent border-b rounded-none flex-shrink-0">
        <TabsTrigger 
          value="ai" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-muted/30 py-3"
        >
          AI Tools
        </TabsTrigger>
        <TabsTrigger 
          value="feedback" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-muted/30 py-3"
        >
          AI Feedback
        </TabsTrigger>
        <TabsTrigger 
          value="references" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-muted/30 py-3"
        >
          References
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="ai" className="flex-1 m-0 border-0 focus-visible:ring-0 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <AIToolsPanel
            projectId={projectId}
            selectedText={selectedText}
            onInsertText={onInsertText}
          />
        </div>
      </TabsContent>
      
      <TabsContent value="feedback" className="flex-1 m-0 border-0 focus-visible:ring-0 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <AIFeedbackPanel
            projectId={projectId}
            editorRef={editorRef}
            projectMetadata={projectMetadata}
          />
        </div>
      </TabsContent>
      
      <TabsContent value="references" className="flex-1 m-0 border-0 focus-visible:ring-0 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <ReferenceSidebar projectId={projectId} />
        </div>
      </TabsContent>
    </Tabs>
  );
};
