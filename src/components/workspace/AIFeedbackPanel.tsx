import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageSquare, Loader2, Sparkles, Plus } from "lucide-react";

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
  const [customFeedback, setCustomFeedback] = useState("");

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

CRITICAL: Return ONLY the raw JSON array. Do NOT wrap it in markdown code blocks. Do NOT add any explanatory text before or after the JSON. Just the pure JSON array starting with [ and ending with ].`;

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
          let textToParse = data.text.trim();
          
          // Remove markdown code blocks if present
          const codeBlockMatch = textToParse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (codeBlockMatch) {
            textToParse = codeBlockMatch[1].trim();
          }
          
          // Try to find JSON array in the response
          const jsonMatch = textToParse.match(/\[\s*{[\s\S]*}\s*\]/);
          if (jsonMatch) {
            textToParse = jsonMatch[0];
          }
          
          const parsedFeedback = JSON.parse(textToParse);
          
          if (Array.isArray(parsedFeedback) && parsedFeedback.length > 0) {
            const items = parsedFeedback.map((item: any, index: number) => ({
              id: `feedback-${index}`,
              category: item.category || "General",
              issue: item.issue || item.toString()
            }));
            setFeedbackItems(items);
            toast.success(`Found ${items.length} issue(s) to review`);
          } else {
            throw new Error("Response is not a valid array");
          }
        } catch (parseError) {
          console.error("Failed to parse feedback as JSON:", parseError);
          console.error("Raw response:", data.text);
          toast.error("Failed to parse feedback. Please try again.");
          setFeedbackItems([]);
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

      const language = projectMetadata?.language || "english";

      // Construct regeneration prompt - only feedback, no goal/instructions
      const regeneratePrompt = `You are an expert content editor. Please regenerate the following draft text by addressing ONLY the specific feedback points provided below.

**TARGET LANGUAGE:**
${language}

**FORMATTING REQUIREMENTS (CRITICAL):**
1. Add ONE blank line between each paragraph (use double line breaks)
2. Add ONE blank line after each section heading
3. Keep paragraphs concise - maximum 4-5 sentences per paragraph
4. Break long paragraphs into shorter, digestible chunks
5. Ensure proper line spacing throughout for readability

**CURRENT DRAFT:**
${currentContent}

**FEEDBACK TO ADDRESS:**
${feedbackText}

**CRITICAL INSTRUCTIONS:**
1. Make ONLY minimal changes needed to address the feedback points listed above
2. Do NOT rewrite or restructure the entire draft
3. Focus ONLY on fixing the specific issues mentioned in the feedback
4. Maintain the overall structure, intent, and tone of the original draft
5. Ensure the content remains in ${language}
6. Do NOT add new content or sections that were not requested in the feedback

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

  const handleAddCustomFeedback = () => {
    if (!customFeedback.trim()) {
      toast.error("Please enter your feedback");
      return;
    }

    const newItem: FeedbackItem = {
      id: `custom-${Date.now()}`,
      category: "Custom",
      issue: customFeedback
    };

    setFeedbackItems([...feedbackItems, newItem]);
    setCustomFeedback("");
    toast.success("Custom feedback added");
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
              <div className="mb-4">
                <Label className="text-sm font-medium mb-2 block">Add Your Own Feedback</Label>
                <Textarea
                  placeholder="Enter your own feedback point..."
                  value={customFeedback}
                  onChange={(e) => setCustomFeedback(e.target.value)}
                  rows={3}
                  className="mb-2"
                />
                <Button 
                  onClick={handleAddCustomFeedback}
                  disabled={!customFeedback.trim()}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Custom Feedback
                </Button>
              </div>

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
