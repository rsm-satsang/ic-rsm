import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Languages,
  RefreshCw,
  FileText,
  Mail,
  Wand2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface AIToolsPanelProps {
  projectId: string;
}

const AIToolsPanel = ({ projectId }: AIToolsPanelProps) => {
  const [selectedTool, setSelectedTool] = useState("translate");
  const [compiledPrompt, setCompiledPrompt] = useState("");
  const [language, setLanguage] = useState("es");
  const [aiResponse, setAiResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const runAITool = async (toolType: string) => {
    setLoading(true);
    try {
      // Simulate AI call (will be replaced with actual Gemini API call)
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      const mockPrompt = `[Vocabulary Terms]\nRSM: Risk & Sustainability Management\nInnerContent: Internal content collaboration\n\n[Action: ${toolType}]\nSelected text: Lorem ipsum dolor sit amet...\n\n[Instructions]\nPlease ${toolType} the selected text according to the specifications.`;
      
      setCompiledPrompt(mockPrompt);
      setAiResponse(`This is a simulated ${toolType} response. In production, this will be the actual Gemini API response.`);
      toast.success(`${toolType} completed!`);
    } catch (error) {
      toast.error(`Failed to run ${toolType}`);
    } finally {
      setLoading(false);
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

          {/* Tool Options */}
          {selectedTool === "translate" && (
            <div className="space-y-2">
              <Label>Target Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="it">Italian</SelectItem>
                  <SelectItem value="pt">Portuguese</SelectItem>
                  <SelectItem value="zh">Chinese</SelectItem>
                  <SelectItem value="ja">Japanese</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Warning about Gemini API */}
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="p-3 flex gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-100">
                <p className="font-medium mb-1">Gemini API Required</p>
                <p>Admin must configure the Gemini API key in Settings to enable AI features.</p>
              </div>
            </CardContent>
          </Card>

          {/* Run Button */}
          <Button
            className="w-full"
            onClick={() => runAITool(selectedTool)}
            disabled={loading}
          >
            {loading ? (
              "Processing..."
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Run {tools.find((t) => t.id === selectedTool)?.label}
              </>
            )}
          </Button>

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
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="outline" className="flex-1">
                    Save as Template
                  </Button>
                  <Button size="sm" className="flex-1">
                    Send to AI
                  </Button>
                </div>
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
                <div className="text-sm whitespace-pre-wrap">{aiResponse}</div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" className="flex-1">
                    Reject
                  </Button>
                  <Button size="sm" className="flex-1">
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
