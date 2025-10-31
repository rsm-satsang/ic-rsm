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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Users, X, Mail, Search } from "lucide-react";

interface Collaborator {
  id: string;
  user_id: string;
  access_level: string;
  users: {
    name: string;
    email: string;
    role?: string;
  };
}

interface UserSearchResult {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface InviteDialogProps {
  projectId: string;
  projectOwnerId: string;
  currentUserId: string;
}

const InviteDialog = ({ projectId, projectOwnerId, currentUserId }: InviteDialogProps) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [accessLevel, setAccessLevel] = useState<"viewer" | "editor" | "owner">("viewer");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [projectOwner, setProjectOwner] = useState<any>(null);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (open) {
      fetchCollaborators();
    }
  }, [open]);

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      searchUsers();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const searchUsers = async () => {
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, role")
        .or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error: any) {
      console.error("Error searching users:", error);
    } finally {
      setSearching(false);
    }
  };

  const fetchCollaborators = async () => {
    try {
      // Fetch project owner
      const { data: ownerData, error: ownerError } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("id", projectOwnerId)
        .single();

      if (ownerError) throw ownerError;
      setProjectOwner(ownerData);

      // Fetch collaborators (including admins)
      const { data, error } = await supabase
        .from("collaborators")
        .select(`
          id,
          user_id,
          access_level,
          users!collaborators_user_id_fkey (
            name,
            email,
            role
          )
        `)
        .eq("project_id", projectId);

      if (error) throw error;

      // Fetch pending invitations
      const { data: inviteData, error: inviteError } = await supabase
        .from("invitations")
        .select(`
          id,
          invited_user_id,
          access_level,
          status
        `)
        .eq("project_id", projectId)
        .eq("invited_by", currentUserId);

      if (inviteError) throw inviteError;

      // Fetch user details for invitations
      const invitesWithUsers = await Promise.all(
        (inviteData || []).map(async (invite) => {
          const { data: userData } = await supabase
            .from("users")
            .select("name, email")
            .eq("id", invite.invited_user_id)
            .single();
          
          return {
            ...invite,
            users: userData || { name: "Unknown", email: "" }
          };
        })
      );

      setCollaborators(data || []);
      setPendingInvites(invitesWithUsers);
    } catch (error: any) {
      console.error("Error fetching collaborators:", error);
      toast.error("Failed to load collaborators");
    }
  };

  const handleInvite = async () => {
    if (!selectedUser) {
      toast.error("Please select a user to invite");
      return;
    }

    setLoading(true);
    try {
      const userData = selectedUser;

      // Check if already invited
      const { data: existingInvite } = await supabase
        .from("invitations")
        .select("id, status")
        .eq("project_id", projectId)
        .eq("invited_user_id", userData.id)
        .single();

      if (existingInvite) {
        if (existingInvite.status === "pending") {
          toast.error("User already has a pending invitation");
        } else {
          toast.error("User was already invited");
        }
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

      // Create invitation instead of direct collaborator
      const { error: inviteError } = await supabase
        .from("invitations")
        .insert({
          project_id: projectId,
          invited_user_id: userData.id,
          invited_by: currentUserId,
          access_level: accessLevel,
          status: "pending",
        });

      if (inviteError) throw inviteError;

      // Log to timeline
      const { data: currentUserData } = await supabase
        .from("users")
        .select("name")
        .eq("id", currentUserId)
        .single();

      await supabase.from("timeline").insert({
        project_id: projectId,
        event_type: "collaborator_added",
        event_details: { 
          user: userData.name, 
          role: accessLevel,
          invited: true 
        },
        user_id: currentUserId,
        user_name: currentUserData?.name || "Unknown User",
      });

      toast.success(`Invitation sent to ${userData.name}`);
      setSearchQuery("");
      setSelectedUser(null);
      setSearchResults([]);
      fetchCollaborators();
    } catch (error: any) {
      console.error("Error inviting user:", error);
      toast.error("Failed to send invitation");
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
              <Label>Search User by Name or Email</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {/* Search Results Dropdown */}
              {searchResults.length > 0 && (
                <ScrollArea className="h-[200px] border rounded-md p-2">
                  {searchResults.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => {
                        setSelectedUser(user);
                        setSearchQuery(user.name);
                        setSearchResults([]);
                      }}
                      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-accent ${
                        selectedUser?.id === user.id ? 'bg-accent' : ''
                      }`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {user.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      {user.role === 'admin' && (
                        <Badge variant="secondary" className="text-xs">Admin</Badge>
                      )}
                    </div>
                  ))}
                </ScrollArea>
              )}

              {selectedUser && (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-accent/50">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {selectedUser.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{selectedUser.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setSelectedUser(null);
                      setSearchQuery("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
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

            <Button onClick={handleInvite} disabled={loading || !selectedUser} className="w-full">
              <Mail className="mr-2 h-4 w-4" />
              {loading ? "Inviting..." : "Send Invite"}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <Label>Project Members</Label>
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              {/* Project Owner */}
              {projectOwner && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-muted-foreground">
                    Project Owner
                  </h4>
                  <div className="p-3 border rounded-lg bg-primary/5">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {projectOwner.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{projectOwner.name}</p>
                        <p className="text-xs text-muted-foreground">{projectOwner.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="default">Owner</Badge>
                        {projectOwner.role === 'admin' && (
                          <Badge variant="secondary">Admin</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
                {/* Pending Invitations */}
                {pendingInvites.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground">
                      Pending Invitations
                    </h4>
                    <div className="space-y-2">
                      {pendingInvites.map((invite) => (
                        <div
                          key={invite.id}
                          className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {invite.users.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{invite.users.name}</p>
                              <p className="text-xs text-muted-foreground">{invite.users.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={
                                invite.status === "pending" 
                                  ? "secondary" 
                                  : invite.status === "rejected" 
                                  ? "destructive" 
                                  : "default"
                              }
                            >
                              {invite.status}
                            </Badge>
                            <Badge variant="outline">{invite.access_level}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Active Collaborators */}
                {collaborators.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground">
                      Active Collaborators
                    </h4>
                    <div className="space-y-2">
                      {collaborators.map((collab) => (
                        <div
                          key={collab.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback>
                                {collab.users.name.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{collab.users.name}</p>
                              <p className="text-xs text-muted-foreground">{collab.users.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{collab.access_level}</Badge>
                            {collab.users.role === 'admin' && (
                              <Badge variant="secondary">Admin</Badge>
                            )}
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
                    </div>
                  </div>
                )}
              </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InviteDialog;
