import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import logoImg from "@/assets/logo_rsm_lotus.png";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for auth state changes to detect when the user is authenticated via the reset link
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setChecking(false);
        setError(null);
      } else if (event === "SIGNED_IN" && session) {
        // User is signed in, they can reset their password
        setChecking(false);
        setError(null);
      }
    });

    // Check if there's already a session (user clicked the link and was authenticated)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Check URL hash for error
      const hash = window.location.hash;
      if (hash.includes("error=")) {
        const errorMatch = hash.match(/error_description=([^&]*)/);
        const errorMessage = errorMatch 
          ? decodeURIComponent(errorMatch[1].replace(/\+/g, ' '))
          : "The reset link is invalid or has expired.";
        setError(errorMessage);
        setChecking(false);
        return;
      }

      if (session) {
        setChecking(false);
        setError(null);
      } else {
        // Give it a moment for the auth state to process the token
        setTimeout(() => {
          setChecking(false);
          if (!session) {
            setError("The reset link is invalid or has expired. Please request a new one.");
          }
        }, 2000);
      }
    };

    checkSession();

    return () => subscription.unsubscribe();
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      toast.success("Password updated successfully!");
      navigate("/auth");
    } catch (error: any) {
      toast.error(error.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Verifying reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-center">
              <img src={logoImg} alt="Srijan Logo" className="h-14 w-14 rounded-full opacity-50" />
            </div>
            <CardTitle className="text-2xl text-center">Link Expired</CardTitle>
            <CardDescription className="text-center">
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              onClick={() => navigate("/auth")}
            >
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center">
            <div className="p-3 bg-gradient-primary rounded-2xl">
              <FileText className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center">Set New Password</CardTitle>
          <CardDescription className="text-center">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating..." : "Update Password"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/auth")}
            >
              Back to Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
