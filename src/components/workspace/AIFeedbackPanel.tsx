import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageSquare, Loader2, Sparkles } from "lucide-react";

interface FeedbackItem {
  id: string;
  category: string;
  issue: string;
}

interface AIFeedbackPanelProps {
  projectId: string;
  editorRef: any;
  projectMetadata?: any;
}

const AIFeedbackPanel = ({ projectId, editorRef, projectMetadata }: AIFeedbackPanelProps) => {
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const getFeedback = async () => {
    if (!editorRef?.getHTML) {
      toast.error("Editor not ready. Please try again.");
      return;
    }

    setLoading(true);
    setFeedbackItems([]);
    setSelectedItems([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Please log in to use AI features");
        setLoading(false);
        return;
      }

      // Get current content from editor
      const editorElement = document.querySelector('.ProseMirror');
      const currentContent = editorElement?.textContent || "";

      if (!currentContent.trim()) {
        toast.error("No content to review. Please add some text first.");
        setLoading(false);
        return;
      }

      // Get goal from project metadata
      const goal = projectMetadata?.goal || "Not specified";
      const language = projectMetadata?.language || "english";

      // Construct feedback prompt - ONLY NEGATIVES
      const feedbackPrompt = `You are an expert editor and content reviewer. Please provide ONLY CRITICAL FEEDBACK identifying issues, problems, and areas for improvement in the following draft text. DO NOT mention positive aspects or what is done well.

**GOAL/INSTRUCTIONS FOR THIS CONTENT:**
${goal}

**TARGET LANGUAGE:**
${language}

**DRAFT TEXT TO REVIEW:**
${currentContent}

**IDENTIFY ONLY ISSUES AND PROBLEMS IN THESE AREAS:**

1. **Spelling Mistakes**: List any spelling errors with corrections.
2. **Grammatical Errors**: Point out grammatical mistakes with corrections.
3. **Broken Sentences**: Highlight incomplete or awkwardly structured sentences.
4. **Goal Misalignment**: Identify where the draft doesn't align with the stated goal and instructions.
5. **Non-Compliance**: Note areas where the draft doesn't comply with instructions.
6. **Language Errors**: If the target language is ${language}, identify any language accuracy issues.

**CRITICAL FORMATTING REQUIREMENTS:**
You MUST format your response as a JSON array of objects. Each object represents ONE specific issue.
Format: [{"category": "Category Name", "issue": "Description of the specific issue"}]

Example format:
[
  {"category": "Spelling", "issue": "Word 'recieve' should be 'receive' in paragraph 2"},
  {"category": "Grammar", "issue": "Subject-verb disagreement: 'The team are' should be 'The team is'"},
  {"category": "Goal Alignment", "issue": "Missing key point about X mentioned in the goal"}
]

Return ONLY the JSON array. Do not include any other text, explanations, or markdown formatting.`;

      const { data, error } = await supabase.functions.invoke('gemini-ai', {
        body: { 
          prompt: feedbackPrompt,
          action: 'feedback',
          projectId: projectId
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to get feedback');
      }

      if (data?.error) {
        toast.error(data.error);
        setLoading(false);
        return;
      }

      if (data?.text) {
        try {
          // Try to parse as JSON
          const parsedFeedback = JSON.parse(data.text);
          if (Array.isArray(parsedFeedback)) {
            const items = parsedFeedback.map((item: any, index: number) => ({
              id: `feedback-${index}`,
              category: item.category || "General",
              issue: item.issue || item.toString()
            }));
            setFeedbackItems(items);
            toast.success(`Found ${items.length} issue(s) to review`);
          } else {
            throw new Error("Response is not an array");
          }
        } catch (parseError) {
          console.error("Failed to parse feedback as JSON:", parseError);
          // Fallback: treat as single item
          setFeedbackItems([{
            id: 'feedback-0',
            category: 'General',
            issue: data.text
          }]);
          toast.success("Feedback generated!");
        }
      } else {
        toast.error("No feedback received");
      }
    } catch (error: any) {
      console.error("Error getting feedback:", error);
      toast.error(error.message || "Failed to get feedback");
    } finally {
      setLoading(false);
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleRegenerateWithFeedback = async () => {
    if (selectedItems.length === 0) {
      toast.error("Please select at least one feedback item to address");
      return;
    }

    if (!editorRef?.getHTML) {
      toast.error("Editor not ready. Please try again.");
      return;
    }

    setRegenerating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Please log in to use AI features");
        setRegenerating(false);
        return;
      }

      // Get current content
      const editorElement = document.querySelector('.ProseMirror');
      const currentContent = editorElement?.textContent || "";

      // Get selected feedback items
      const selectedFeedbackItems = feedbackItems.filter(item => 
        selectedItems.includes(item.id)
      );

      const feedbackText = selectedFeedbackItems
        .map(item => `- [${item.category}] ${item.issue}`)
        .join('\n');

      const goal = projectMetadata?.goal || "Not specified";
      const language = projectMetadata?.language || "english";

      // Construct regeneration prompt
      const regeneratePrompt = `You are an expert content editor. Please regenerate the following draft text by addressing the specific feedback points provided.

**ORIGINAL GOAL/INSTRUCTIONS:**
${goal}

**TARGET LANGUAGE:**
${language}

**CURRENT DRAFT:**
${currentContent}

**FEEDBACK TO ADDRESS:**
${feedbackText}

**INSTRUCTIONS:**
1. Take the current draft and improve it by addressing ALL the feedback points listed above
2. Maintain the overall structure and intent of the original draft
3. Ensure the content is in ${language}
4. Fix all issues mentioned in the feedback
5. Keep the same tone and style as the original

Return ONLY the improved draft text. Do not include explanations, notes, or any other commentary.`;

      const { data, error } = await supabase.functions.invoke('gemini-ai', {
        body: { 
          prompt: regeneratePrompt,
          action: 'regenerate_with_feedback',
          projectId: projectId
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to regenerate content');
      }

      if (data?.error) {
        toast.error(data.error);
        setRegenerating(false);
        return;
      }

      if (data?.text) {
        // Insert regenerated content into editor
        editorRef.commands.setContent(data.text);

        // Get current version to determine next version number
        const { data: maxVersionData } = await supabase
          .from("versions")
          .select("version_number")
          .eq("project_id", projectId)
          .order("version_number", { ascending: false })
          .limit(1)
          .single();

        const nextVersionNumber = (maxVersionData?.version_number || 0) + 1;

        // Create new version
        const { error: versionError } = await supabase
          .from("versions")
          .insert({
            project_id: projectId,
            content: data.text,
            title: `AI-Improved Draft ${nextVersionNumber}`,
            description: `Regenerated based on ${selectedItems.length} feedback item(s)`,
            version_number: nextVersionNumber,
            created_by: session.user.id
          });

        if (versionError) throw versionError;

        // Add timeline event
        await supabase.from("timeline").insert({
          project_id: projectId,
          user_id: session.user.id,
          user_name: session.user.email || "User",
          event_type: "ai_action",
          event_details: {
            action: "regenerate_with_feedback",
            feedback_items: selectedItems.length
          }
        });

        toast.success("Draft regenerated and saved as new version!");
        setSelectedItems([]);
        setFeedbackItems([]);
      } else {
        toast.error("No content received from AI");
      }
    } catch (error: any) {
      console.error("Error regenerating content:", error);
      toast.error(error.message || "Failed to regenerate content");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="h-full flex flex-col w-full">
      <div className="p-4 border-b flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">AI Feedback</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Get comprehensive review and feedback on your draft
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <Button 
            onClick={getFeedback}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <MessageSquare className="mr-2 h-4 w-4" />
                Get Feedback from AI
              </>
            )}
          </Button>

          {feedbackItems.length > 0 && (
            <>
              <div className="space-y-3">
                {feedbackItems.map((item) => (
                  <Card 
                    key={item.id}
                    className={`cursor-pointer transition-all ${
                      selectedItems.includes(item.id) 
                        ? 'border-primary bg-primary/5' 
                        : 'hover:border-muted-foreground/30'
                    }`}
                    onClick={() => toggleItemSelection(item.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox 
                          checked={selectedItems.includes(item.id)}
                          onCheckedChange={() => toggleItemSelection(item.id)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="font-semibold text-sm text-primary mb-1">
                            {item.category}
                          </div>
                          <div className="text-sm text-foreground">
                            {item.issue}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {selectedItems.length > 0 && (
                <Button 
                  onClick={handleRegenerateWithFeedback}
                  disabled={regenerating}
                  className="w-full"
                  size="lg"
                >
                  {regenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Regenerating Draft...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Regenerate Draft ({selectedItems.length} item{selectedItems.length > 1 ? 's' : ''})
                    </>
                  )}
                </Button>
              )}
            </>
          )}

          {feedbackItems.length === 0 && !loading && (
            <Card className="border-muted">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground text-center">
                  Click the button above to get AI-powered feedback identifying issues in your draft. 
                  Select specific feedback items and regenerate your draft to address them.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default AIFeedbackPanel;
