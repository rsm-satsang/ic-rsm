import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReferenceSidebar } from "./ReferenceSidebar";
import AIToolsPanel from "./AIToolsPanel";

interface WorkspaceSidebarProps {
  projectId: string;
  selectedText: string;
  onInsertText: (text: string, aiFeatureName: string) => Promise<void>;
}

export const WorkspaceSidebar = ({ projectId, selectedText, onInsertText }: WorkspaceSidebarProps) => {
  return (
    <Tabs defaultValue="ai" className="flex flex-col h-full">
      <TabsList className="w-full grid grid-cols-2 h-auto p-0 bg-transparent border-b rounded-none">
        <TabsTrigger 
          value="ai" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-muted/30 py-3"
        >
          AI Tools
        </TabsTrigger>
        <TabsTrigger 
          value="references" 
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-muted/30 py-3"
        >
          References
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="ai" className="flex-1 overflow-y-auto m-0 border-0 focus-visible:ring-0">
        <AIToolsPanel
          projectId={projectId}
          selectedText={selectedText}
          onInsertText={onInsertText}
        />
      </TabsContent>
      
      <TabsContent value="references" className="flex-1 overflow-y-auto m-0 border-0 focus-visible:ring-0">
        <ReferenceSidebar projectId={projectId} />
      </TabsContent>
    </Tabs>
  );
};
