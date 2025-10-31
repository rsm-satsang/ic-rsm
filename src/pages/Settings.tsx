import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Save, Key } from "lucide-react";
import type { User } from "@supabase/supabase-js";

const Settings = () => {
  const [user, setUser] = useState<User | null>(null);
  const [geminiKey, setGeminiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (!currentUser) {
        navigate("/auth");
        return;
      }

      setUser(currentUser);
      
      // Try to fetch existing API key from user metadata or a settings table
      const { data: userData } = await supabase
        .from("users")
        .select("gemini_api_key")
        .eq("id", currentUser.id)
        .single();

      if (userData?.gemini_api_key) {
        setGeminiKey(userData.gemini_api_key);
      }
    } catch (error) {
      console.error("Error checking user:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({ gemini_api_key: geminiKey })
        .eq("id", user.id);

      if (error) throw error;

      toast.success("Settings saved successfully!");
    } catch (error: any) {
      toast.error("Failed to save settings");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-primary rounded-lg">
                <Key className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle>API Configuration</CardTitle>
                <CardDescription>Configure your Gemini API key for AI features</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gemini-key">Gemini API Key</Label>
              <Input
                id="gemini-key"
                type="password"
                placeholder="Enter your Gemini API key"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Get your API key from{" "}
                <a
                  href="https://makersuite.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Google AI Studio
                </a>
              </p>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
