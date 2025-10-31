import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Users, X, Mail } from "lucide-react";

interface Collaborator {
  id: string;
  user_id: string;
  access_level: string;
  users: {
    name: string;
    email: string;
  };
}

interface InviteDialogProps {
  projectId: string;
  projectOwnerId: string;
  currentUserId: string;
}

const InviteDialog = ({ projectId, projectOwnerId, currentUserId }: InviteDialogProps) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [accessLevel, setAccessLevel] = useState<"viewer" | "editor" | "owner">("viewer");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchCollaborators();
    }
  }, [open]);

  const fetchCollaborators = async () => {
    try {
      const { data, error } = await supabase
        .from("collaborators")
        .select(`
          id,
          user_id,
          access_level,
          users!collaborators_user_id_fkey (
            name,
            email
          )
        `)
        .eq("project_id", projectId);

      if (error) throw error;

      setCollaborators(data || []);
    } catch (error: any) {
      console.error("Error fetching collaborators:", error);
      toast.error("Failed to load collaborators");
    }
  };

  const handleInvite = async () => {
    if (!email) {
      toast.error("Please enter an email");
      return;
    }

    setLoading(true);
    try {
      // Find user by email
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("email", email)
        .single();

      if (userError || !userData) {
        toast.error("User not found. They need to sign up first.");
        setLoading(false);
        return;
      }

      // Check if already a collaborator
      const { data: existingCollab } = await supabase
        .from("collaborators")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", userData.id)
        .single();

      if (existingCollab) {
        toast.error("User is already a collaborator");
        setLoading(false);
        return;
      }

      // Add collaborator
      const { error: collabError } = await supabase
        .from("collaborators")
        .insert({
          project_id: projectId,
          user_id: userData.id,
          access_level: accessLevel,
          added_by: currentUserId,
        });

      if (collabError) throw collabError;

      // Log to timeline
      const { data: currentUserData } = await supabase
        .from("users")
        .select("name")
        .eq("id", currentUserId)
        .single();

      await supabase.from("timeline").insert({
        project_id: projectId,
        event_type: "collaborator_added",
        event_details: { user: userData.name, role: accessLevel },
        user_id: currentUserId,
        user_name: currentUserData?.name || "Unknown User",
      });

      toast.success(`${userData.name} added as ${accessLevel}`);
      setEmail("");
      fetchCollaborators();
    } catch (error: any) {
      console.error("Error inviting user:", error);
      toast.error("Failed to invite user");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (collaboratorId: string, userName: string) => {
    try {
      const { error } = await supabase
        .from("collaborators")
        .delete()
        .eq("id", collaboratorId);

      if (error) throw error;

      // Log to timeline
      const { data: currentUserData } = await supabase
        .from("users")
        .select("name")
        .eq("id", currentUserId)
        .single();

      await supabase.from("timeline").insert({
        project_id: projectId,
        event_type: "collaborator_added",
        event_details: { user: userName, action: "removed" },
        user_id: currentUserId,
        user_name: currentUserData?.name || "Unknown User",
      });

      toast.success("Collaborator removed");
      fetchCollaborators();
    } catch (error: any) {
      console.error("Error removing collaborator:", error);
      toast.error("Failed to remove collaborator");
    }
  };

  const isOwner = currentUserId === projectOwnerId;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Users className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Collaborators</DialogTitle>
          <DialogDescription>
            Invite people to collaborate on this project
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Access Level</Label>
              <Select value={accessLevel} onValueChange={(v: any) => setAccessLevel(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer - Can view only</SelectItem>
                  <SelectItem value="editor">Editor - Can edit</SelectItem>
                  <SelectItem value="owner">Owner - Full access</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleInvite} disabled={loading} className="w-full">
              <Mail className="mr-2 h-4 w-4" />
              {loading ? "Inviting..." : "Send Invite"}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <Label>Current Collaborators ({collaborators.length})</Label>
          <ScrollArea className="h-48 border rounded-md p-2">
            <div className="space-y-2">
              {collaborators.map((collab) => (
                <div
                  key={collab.id}
                  className="flex items-center justify-between p-2 bg-muted rounded-md"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{collab.users.name}</p>
                    <p className="text-xs text-muted-foreground">{collab.users.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{collab.access_level}</Badge>
                    {isOwner && collab.user_id !== projectOwnerId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemove(collab.id, collab.users.name)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {collaborators.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No collaborators yet
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InviteDialog;
