import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
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
  Newspaper,
  Upload,
  Book,
} from "lucide-react";
import { toast } from "sonner";

interface AIToolsPanelProps {
  projectId: string;
  selectedText: string;
  onInsertText: (text: string, aiFeatureName: string) => void;
}

interface Vocabulary {
  id: string;
  name: string;
  file_url: string | null;
}

const AIToolsPanel = ({ projectId, selectedText, onInsertText }: AIToolsPanelProps) => {
  const navigate = useNavigate();
  const [selectedTool, setSelectedTool] = useState("translate");
  const [compiledPrompt, setCompiledPrompt] = useState("");
  const [language, setLanguage] = useState("es");
  const [aiResponse, setAiResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [vocabularies, setVocabularies] = useState<Vocabulary[]>([]);
  const [selectedVocabs, setSelectedVocabs] = useState<Set<string>>(new Set());
  const [uploadingVocab, setUploadingVocab] = useState(false);

  useEffect(() => {
    fetchVocabularies();
  }, []);

  useEffect(() => {
    if (selectedText) {
      generatePrompt(selectedTool);
    }
  }, [selectedText, selectedTool]);

  const fetchVocabularies = async () => {
    try {
      const { data, error } = await supabase
        .from('vocabularies')
        .select('id, name, file_url')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setVocabularies(data);
      }
    } catch (error) {
      console.error('Error fetching vocabularies:', error);
    }
  };

  const handleVocabUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      toast.error('Please upload a .txt file');
      return;
    }

    setUploadingVocab(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please log in to upload vocabulary files');
        return;
      }

      // Upload to storage
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('vocabulary-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create vocabulary entry (store storage path, not URL)
      const { error: dbError } = await supabase
        .from('vocabularies')
        .insert({
          name: file.name.replace('.txt', ''),
          file_url: filePath, // Store the storage path
          parsed_keywords: [],
          created_by: user.id,
          visibility: 'public'
        });

      if (dbError) throw dbError;

      toast.success('Vocabulary file uploaded successfully!');
      fetchVocabularies();
      event.target.value = '';
    } catch (error: any) {
      console.error('Error uploading vocabulary:', error);
      toast.error(error.message || 'Failed to upload vocabulary file');
    } finally {
      setUploadingVocab(false);
    }
  };

  const toggleVocabSelection = (vocabId: string) => {
    const newSelected = new Set(selectedVocabs);
    if (newSelected.has(vocabId)) {
      newSelected.delete(vocabId);
    } else {
      newSelected.add(vocabId);
    }
    setSelectedVocabs(newSelected);
  };

  const preprocessWithVocabulary = async (text: string): Promise<string> => {
    if (selectedVocabs.size === 0) return text;

    try {
      const vocabularyMap = new Map<string, string>();

      // Load all selected vocabulary files
      for (const vocabId of selectedVocabs) {
        const vocab = vocabularies.find(v => v.id === vocabId);
        if (!vocab || !vocab.file_url) continue;

        // Fetch file content from storage using authenticated request
        const { data, error } = await supabase.storage
          .from('vocabulary-files')
          .download(vocab.file_url);

        if (error || !data) {
          console.error('Error downloading vocabulary file:', error);
          continue;
        }

        const content = await data.text();

        // Parse vocabulary (support both - and = separators)
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let [term, translation] = trimmed.includes(' - ') 
            ? trimmed.split(' - ') 
            : trimmed.split(' = ');

          if (term && translation) {
            term = term.trim();
            translation = translation.trim();
            // Case-insensitive key, last one wins on conflicts
            vocabularyMap.set(term.toLowerCase(), translation);
          }
        }
      }

      if (vocabularyMap.size === 0) return text;

      let processedText = text;

      // Sort terms by length (longest first) for better partial matching
      const sortedTerms = Array.from(vocabularyMap.keys()).sort((a, b) => b.length - a.length);

      // First pass: whole word matching (case-insensitive)
      for (const term of sortedTerms) {
        const translation = vocabularyMap.get(term)!;
        const regex = new RegExp(`\\b${term}\\b`, 'gi');
        processedText = processedText.replace(regex, translation);
      }

      // Second pass: partial matching (case-insensitive)
      for (const term of sortedTerms) {
        const translation = vocabularyMap.get(term)!;
        const regex = new RegExp(term, 'gi');
        processedText = processedText.replace(regex, translation);
      }

      return processedText;
    } catch (error) {
      console.error('Error preprocessing with vocabulary:', error);
      return text; // Return original text on error
    }
  };

  const generatePrompt = (toolType: string) => {
    let prompt = "";
    const text = selectedText || "[No text selected]";

    // Language name mapping
    const languageNames: Record<string, string> = {
      en: "English",
      es: "Spanish",
      fr: "French",
      de: "German",
      it: "Italian",
      pt: "Portuguese",
      ru: "Russian",
      ja: "Japanese",
      ko: "Korean",
      zh: "Chinese",
      hi: "Hindi",
      ar: "Arabic"
    };

    const targetLanguageName = languageNames[language] || language;

    switch (toolType) {
      case "translate":
        prompt = `Translate the following text to ${targetLanguageName}:\n\n${text}\n\nProvide only the translation, no additional explanation.`;
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
      case "newsletter":
        prompt = `NEWSLETTER GENERATION PIPELINE:
1. First, translate the following Hindi text to English
2. Then, format the translated text as a professional Substack newsletter

INPUT TEXT (in Hindi):
${text}

REQUIREMENTS:
- Maintain the core message and meaning during translation
- Format as a compelling Substack newsletter with:
  * Engaging headline
  * Brief intro paragraph
  * Well-structured body with subheadings
  * Strong conclusion or call-to-action
  * Professional yet conversational tone
- Use proper newsletter formatting with line breaks

Provide the complete translated and formatted newsletter.`;
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

      // Preprocess text with selected vocabularies
      const preprocessedText = await preprocessWithVocabulary(selectedText);
      
      // Regenerate prompt with preprocessed text
      let finalPrompt = compiledPrompt;
      if (preprocessedText !== selectedText) {
        finalPrompt = compiledPrompt.replace(selectedText, preprocessedText);
      }

      console.log('Session found, calling edge function...');
      console.log('Project ID:', projectId);
      console.log('Action:', selectedTool);
      console.log('Vocabularies applied:', selectedVocabs.size);

      const { data, error } = await supabase.functions.invoke('gemini-ai', {
        body: { 
          prompt: finalPrompt,
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
        toast.error(data.error);
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
      // Map tool IDs to friendly names
      const toolNames: Record<string, string> = {
        translate: "translated",
        rephrase: "rephrased",
        summarize: "summarized",
        generate: "generated",
        email: "email",
        newsletter: "newsletter"
      };
      
      const featureName = toolNames[selectedTool] || selectedTool;
      onInsertText(aiResponse, featureName);
      setAiResponse("");
      setCompiledPrompt("");
      toast.success("New version created successfully!");
    }
  };

  const tools = [
    { id: "translate", label: "Translate", icon: Languages, color: "text-blue-500" },
    { id: "rephrase", label: "Rephrase", icon: RefreshCw, color: "text-purple-500" },
    { id: "summarize", label: "Summarize", icon: FileText, color: "text-green-500" },
    { id: "generate", label: "Generate", icon: Wand2, color: "text-amber-500" },
    { id: "email", label: "Email Draft", icon: Mail, color: "text-red-500" },
    { id: "newsletter", label: "Newsletter", icon: Newspaper, color: "text-cyan-500" },
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

          {/* Newsletter Info */}
          {selectedTool === "newsletter" && (
            <Card className="border-cyan-200 bg-cyan-50 dark:bg-cyan-950/20">
              <CardContent className="p-3">
                <p className="text-xs font-medium mb-1 text-cyan-900 dark:text-cyan-100">
                  Newsletter Generation Pipeline
                </p>
                <p className="text-xs text-cyan-700 dark:text-cyan-200">
                  Input Hindi text → Translate to English → Format as Substack newsletter
                </p>
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

          {/* Reference Vocabulary Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Book className="h-4 w-4" />
                Reference Vocabulary
              </CardTitle>
              <CardDescription className="text-xs">
                Upload and select vocabulary files for term matching
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Upload Button */}
              <div>
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleVocabUpload}
                  className="hidden"
                  id="vocab-upload"
                  disabled={uploadingVocab}
                />
                <label htmlFor="vocab-upload">
                  <Button
                    variant="outline"
                    className="w-full text-xs"
                    disabled={uploadingVocab}
                    asChild
                  >
                    <span>
                      <Upload className="mr-2 h-3 w-3" />
                      {uploadingVocab ? 'Uploading...' : 'Upload Vocabulary (.txt)'}
                    </span>
                  </Button>
                </label>
              </div>

              {/* Vocabulary List */}
              {vocabularies.length > 0 ? (
                <ScrollArea className="h-32 rounded border p-2">
                  <div className="space-y-2">
                    {vocabularies.map((vocab) => (
                      <div key={vocab.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`vocab-${vocab.id}`}
                          checked={selectedVocabs.has(vocab.id)}
                          onCheckedChange={() => toggleVocabSelection(vocab.id)}
                        />
                        <label
                          htmlFor={`vocab-${vocab.id}`}
                          className="text-xs cursor-pointer flex-1"
                        >
                          {vocab.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No vocabulary files yet. Upload one to get started!
                </p>
              )}

              {selectedVocabs.size > 0 && (
                <p className="text-xs text-primary font-medium">
                  {selectedVocabs.size} vocabular{selectedVocabs.size === 1 ? 'y' : 'ies'} selected
                </p>
              )}
            </CardContent>
          </Card>

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
                  disabled={loading || !selectedText}
                >
                  {loading ? (
                    <>Processing...</>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Send to AI
                    </>
                  )}
                </Button>
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
