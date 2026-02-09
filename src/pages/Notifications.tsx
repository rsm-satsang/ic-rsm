import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, Check, X, Mail } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface Invitation {
  id: string;
  project_id: string;
  invited_by: string;
  access_level: string;
  status: string;
  created_at: string;
  projects: {
    title: string;
    description: string | null;
    type: string;
  };
  inviter: {
    name: string;
    email: string;
  };
}

const Notifications = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUserAndLoadInvitations();
  }, []);

  const checkUserAndLoadInvitations = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (!currentUser) {
        navigate("/auth");
        return;
      }

      setUser(currentUser);
      await loadInvitations(currentUser.id);
    } catch (error) {
      console.error("Error:", error);
      navigate("/auth");
    } finally {
      setLoading(false);
    }
  };

  const loadInvitations = async (userId: string) => {
    try {
      console.log("Loading invitations for user:", userId);
      
      // Use the database function to get invitations with all details
      const { data: invitationsData, error: invitationsError } = await supabase
        .rpc("get_user_invitations", { user_id: userId });
      
      if (invitationsError) {
        console.error("Error fetching invitations:", invitationsError);
        throw invitationsError;
      }

      console.log("Invitations data:", invitationsData);

      if (!invitationsData || invitationsData.length === 0) {
        setInvitations([]);
        return;
      }

      // Transform the data to match the expected format
      const enrichedInvitations = invitationsData.map((invite) => ({
        id: invite.id,
        project_id: invite.project_id,
        invited_by: invite.invited_by,
        access_level: invite.access_level,
        status: invite.status,
        created_at: invite.created_at,
        projects: {
          title: invite.project_title || "Unknown Project",
          description: invite.project_description,
          type: invite.project_type || "document"
        },
        inviter: {
          name: invite.inviter_name || "Unknown",
          email: invite.inviter_email || ""
        }
      }));

      console.log("Enriched invitations:", enrichedInvitations);
      setInvitations(enrichedInvitations);
    } catch (error: any) {
      console.error("Error loading invitations:", error);
      toast.error("Failed to load invitations");
      setInvitations([]);
    }
  };

  const handleAccept = async (invitationId: string) => {
    try {
      const { error } = await supabase.rpc("accept_invitation", {
        invitation_id: invitationId,
      });

      if (error) throw error;

      toast.success("Invitation accepted!");
      
      // Refresh invitations
      if (user) {
        await loadInvitations(user.id);
      }
    } catch (error: any) {
      console.error("Error accepting invitation:", error);
      toast.error(error.message || "Failed to accept invitation");
    }
  };

  const handleReject = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from("invitations")
        .update({ status: "rejected" })
        .eq("id", invitationId);

      if (error) throw error;

      toast.success("Invitation rejected");
      
      // Refresh invitations
      if (user) {
        await loadInvitations(user.id);
      }
    } catch (error: any) {
      console.error("Error rejecting invitation:", error);
      toast.error("Failed to reject invitation");
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "accepted":
        return "default";
      case "rejected":
        return "destructive";
      default:
        return "secondary";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle ml-14">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Mail className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>
                  Manage your project invitations
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {invitations.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No invitations</p>
              </div>
            ) : (
              <div className="space-y-4">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">
                            {invitation.projects.title}
                          </h3>
                          <Badge variant={getStatusBadgeVariant(invitation.status)}>
                            {invitation.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium">{invitation.inviter.name}</span>{" "}
                          invited you to collaborate as{" "}
                          <span className="font-medium">{invitation.access_level}</span>
                        </p>
                        {invitation.projects.description && (
                          <p className="text-sm text-muted-foreground">
                            {invitation.projects.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(invitation.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      {invitation.status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleAccept(invitation.id)}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(invitation.id)}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Notifications;
