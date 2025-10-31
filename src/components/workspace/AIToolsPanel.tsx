import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import {
  Sparkles,
  Languages,
  RefreshCw,
  FileText,
  Mail,
  Wand2,
  AlertCircle,
  Settings,
} from "lucide-react";
import { toast } from "sonner";

interface AIToolsPanelProps {
  projectId: string;
  selectedText: string;
  onInsertText: (text: string) => void;
}

const AIToolsPanel = ({ projectId, selectedText, onInsertText }: AIToolsPanelProps) => {
  const navigate = useNavigate();
  const [selectedTool, setSelectedTool] = useState("translate");
  const [compiledPrompt, setCompiledPrompt] = useState("");
  const [language, setLanguage] = useState("es");
  const [aiResponse, setAiResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  useEffect(() => {
    checkApiKey();
  }, []);

  useEffect(() => {
    if (selectedText) {
      generatePrompt(selectedTool);
    }
  }, [selectedText, selectedTool]);

  const checkApiKey = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('users')
        .select('gemini_api_key')
        .eq('id', user.id)
        .single();

      if (!error && data?.gemini_api_key) {
        setHasApiKey(true);
      } else {
        setHasApiKey(false);
      }
    } catch (error) {
      console.error('Error checking API key:', error);
      setHasApiKey(false);
    }
  };

  const generatePrompt = (toolType: string) => {
    let prompt = "";
    const text = selectedText || "[No text selected]";

    switch (toolType) {
      case "translate":
        prompt = `Translate the following text to ${language}:\n\n${text}\n\nProvide only the translation, no additional explanation.`;
        break;
      case "rephrase":
        prompt = `Rephrase the following text in a different way while maintaining the same meaning:\n\n${text}\n\nProvide only the rephrased text.`;
        break;
      case "summarize":
        prompt = `Summarize the following text concisely:\n\n${text}\n\nProvide a clear and concise summary.`;
        break;
      case "generate":
        prompt = `Continue writing based on this text:\n\n${text}\n\nGenerate a natural continuation.`;
        break;
      case "email":
        prompt = `Write a professional email based on this content:\n\n${text}\n\nFormat as a complete professional email.`;
        break;
      default:
        prompt = text;
    }

    setCompiledPrompt(prompt);
  };

  const sendToAI = async () => {
    if (!compiledPrompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    if (!selectedText.trim()) {
      toast.error("Please select some text in the editor first");
      return;
    }

    setLoading(true);
    setAiResponse("");

    try {
      console.log('Getting session...');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Please log in to use AI features");
        setLoading(false);
        return;
      }

      console.log('Session found, calling edge function...');
      console.log('Project ID:', projectId);
      console.log('Action:', selectedTool);

      const { data, error } = await supabase.functions.invoke('gemini-ai', {
        body: { 
          prompt: compiledPrompt,
          action: selectedTool,
          projectId: projectId
        }
      });

      console.log('Edge function response:', data);
      console.log('Edge function error:', error);

      if (error) {
        console.error('Edge function error details:', error);
        throw new Error(error.message || 'Failed to call edge function');
      }

      if (data?.error) {
        console.error('AI error from edge function:', data.error);
        
        // Check if it's the API key missing error
        if (data.error.includes('Gemini API key not configured')) {
          setHasApiKey(false);
          toast.error(
            "Gemini API key not configured", 
            {
              description: "Click the Settings button below to add your API key",
              duration: 5000,
            }
          );
        } else {
          toast.error(data.error);
        }
        
        setLoading(false);
        return;
      }

      if (data?.text) {
        setAiResponse(data.text);
        toast.success("AI response generated!");
      } else {
        toast.error("No response from AI");
      }
    } catch (error: any) {
      console.error("AI error details:", error);
      toast.error(error.message || "Failed to send request to Edge Function");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptAndInsert = () => {
    if (aiResponse) {
      onInsertText(aiResponse);
      setAiResponse("");
      setCompiledPrompt("");
      toast.success("Text inserted into editor!");
    }
  };

  const tools = [
    { id: "translate", label: "Translate", icon: Languages, color: "text-blue-500" },
    { id: "rephrase", label: "Rephrase", icon: RefreshCw, color: "text-purple-500" },
    { id: "summarize", label: "Summarize", icon: FileText, color: "text-green-500" },
    { id: "generate", label: "Generate", icon: Wand2, color: "text-amber-500" },
    { id: "email", label: "Email Draft", icon: Mail, color: "text-red-500" },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">AI Tools</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Select text and choose an AI action
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Tool Selection */}
          <div className="grid grid-cols-2 gap-2">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Button
                  key={tool.id}
                  variant={selectedTool === tool.id ? "default" : "outline"}
                  className="h-auto py-3 flex flex-col items-center gap-2"
                  onClick={() => setSelectedTool(tool.id)}
                >
                  <Icon className={`h-5 w-5 ${tool.color}`} />
                  <span className="text-xs">{tool.label}</span>
                </Button>
              );
            })}
          </div>

          {/* API Key Warning */}
          {hasApiKey === false && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
              <CardContent className="p-3 space-y-2">
                <div className="flex gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-red-900 dark:text-red-100">
                      Gemini API Key Required
                    </p>
                    <p className="text-xs text-red-700 dark:text-red-200 mt-1">
                      Configure your API key to use AI features
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs"
                  onClick={() => navigate('/settings')}
                >
                  <Settings className="mr-2 h-3 w-3" />
                  Go to Settings
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Selected Text Info */}
          {selectedText ? (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-3">
                <p className="text-xs font-medium mb-1">Selected Text:</p>
                <p className="text-xs text-muted-foreground line-clamp-3">{selectedText}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="p-3 flex gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 dark:text-amber-100">
                  Select some text in the editor to use AI tools
                </p>
              </CardContent>
            </Card>
          )}

          {/* Tool Options */}
          {selectedTool === "translate" && (
            <div className="space-y-2">
              <Label>Target Language</Label>
              <Select value={language} onValueChange={(val) => {
                setLanguage(val);
                generatePrompt(selectedTool);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Hindi">Hindi</SelectItem>
                  <SelectItem value="English">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Compiled Prompt Preview */}
          {compiledPrompt && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Compiled Prompt</CardTitle>
                <CardDescription className="text-xs">
                  Review and edit before sending to AI
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={compiledPrompt}
                  onChange={(e) => setCompiledPrompt(e.target.value)}
                  rows={6}
                  className="text-xs font-mono"
                />
                <Button 
                  size="sm" 
                  className="w-full mt-2"
                  onClick={sendToAI}
                  disabled={loading || !selectedText || hasApiKey === false}
                >
                  {loading ? (
                    <>Processing...</>
                  ) : hasApiKey === false ? (
                    <>
                      <Settings className="mr-2 h-4 w-4" />
                      Configure API Key
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Send to AI
                    </>
                  )}
                </Button>
                {hasApiKey === false && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Add your Gemini API key in Settings to continue
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* AI Response */}
          {aiResponse && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Response
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-40 w-full rounded border p-3 mb-3">
                  <div className="text-sm whitespace-pre-wrap">{aiResponse}</div>
                </ScrollArea>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setAiResponse("")}
                  >
                    Reject
                  </Button>
                  <Button 
                    size="sm" 
                    className="flex-1"
                    onClick={handleAcceptAndInsert}
                  >
                    Accept & Insert
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default AIToolsPanel;
