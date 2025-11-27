import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageSquare, Loader2 } from "lucide-react";

interface AIFeedbackPanelProps {
  projectId: string;
  editorRef: any;
  projectMetadata?: any;
}

const AIFeedbackPanel = ({ projectId, editorRef, projectMetadata }: AIFeedbackPanelProps) => {
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  const getFeedback = async () => {
    if (!editorRef?.getHTML) {
      toast.error("Editor not ready. Please try again.");
      return;
    }

    setLoading(true);
    setFeedback("");

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

      // Construct feedback prompt
      const feedbackPrompt = `You are an expert editor and content reviewer. Please provide comprehensive feedback on the following draft text.

**GOAL/INSTRUCTIONS FOR THIS CONTENT:**
${goal}

**TARGET LANGUAGE:**
${language}

**DRAFT TEXT TO REVIEW:**
${currentContent}

**PROVIDE DETAILED FEEDBACK ON:**

1. **Spelling Mistakes**: Identify any spelling errors and suggest corrections.

2. **Grammatical Errors**: Point out grammatical mistakes and provide corrected versions.

3. **Broken Sentences**: Highlight any incomplete or awkwardly structured sentences.

4. **Alignment with Goal**: Assess how well the draft aligns with the stated goal and instructions. Is the content meeting its intended purpose?

5. **Compliance & Improvements**: Note any areas where the draft doesn't comply with the instructions, and suggest specific improvements to make it better.

6. **Language Accuracy**: If the target language is not English, check if the content is properly written in the target language (${language}).

**FORMAT YOUR FEEDBACK AS:**
- Use clear headings for each section
- Be specific with examples from the text
- Provide actionable suggestions
- Maintain a constructive and helpful tone`;

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
        setFeedback(data.text);
        toast.success("Feedback generated!");
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

          {feedback && (
            <Card>
              <CardContent className="p-4">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <div className="whitespace-pre-wrap text-sm">
                    {feedback}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!feedback && !loading && (
            <Card className="border-muted">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground text-center">
                  Click the button above to get AI-powered feedback on your current draft. 
                  The AI will review spelling, grammar, sentence structure, and alignment with your goals.
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
