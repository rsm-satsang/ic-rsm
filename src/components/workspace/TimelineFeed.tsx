import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  FileText,
  Edit3,
  Sparkles,
  MessageSquare,
  Upload,
  GitBranch,
  AlertCircle,
  Users,
} from "lucide-react";
import { toast } from "sonner";

interface TimelineEvent {
  id: string;
  event_type: string;
  event_details: any;
  user_name: string;
  created_at: string;
}

interface TimelineFeedProps {
  projectId: string;
}

const TimelineFeed = ({ projectId }: TimelineFeedProps) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTimeline();
    subscribeToUpdates();
  }, [projectId]);

  const loadTimeline = async () => {
    try {
      const { data, error } = await supabase
        .from("timeline")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      setEvents(data || []);
    } catch (error: any) {
      toast.error("Failed to load timeline");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToUpdates = () => {
    const channel = supabase
      .channel(`timeline-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "timeline",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          setEvents((current) => [payload.new as TimelineEvent, ...current]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "created":
        return <FileText className="h-4 w-4" />;
      case "edited":
        return <Edit3 className="h-4 w-4" />;
      case "ai_action":
        return <Sparkles className="h-4 w-4" />;
      case "comment":
        return <MessageSquare className="h-4 w-4" />;
      case "file_uploaded":
      case "vocab_added":
        return <Upload className="h-4 w-4" />;
      case "version_created":
        return <GitBranch className="h-4 w-4" />;
      case "status_change":
        return <AlertCircle className="h-4 w-4" />;
      case "collaborator_added":
        return <Users className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case "ai_action":
        return "text-purple-500";
      case "version_created":
        return "text-blue-500";
      case "status_change":
        return "text-amber-500";
      case "collaborator_added":
        return "text-green-500";
      default:
        return "text-muted-foreground";
    }
  };

  const formatEventMessage = (event: TimelineEvent) => {
    const details = event.event_details || {};
    
    switch (event.event_type) {
      case "created":
        return `created the project "${details.title || "Untitled"}"`;
      case "edited":
        return "made edits to the content";
      case "ai_action":
        return `ran ${details.action || "an AI action"}`;
      case "comment":
        return "added a comment";
      case "version_created":
        return `created version ${details.version || ""}`;
      case "status_change":
        return `changed status from ${details.from || ""} to ${details.to || ""}`;
      case "collaborator_added":
        return `added ${details.user || "a collaborator"}`;
      case "vocab_added":
        return `added vocabulary "${details.name || ""}"`;
      case "file_uploaded":
        return `uploaded file "${details.name || ""}"`;
      default:
        return event.event_type.replace("_", " ");
    }
  };

  if (loading) {
    return (
      <div className="h-24 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading timeline...</p>
      </div>
    );
  }

  return (
    <div className="h-32">
      <div className="p-3 border-b bg-muted/30">
        <h4 className="text-sm font-semibold">Activity Timeline</h4>
      </div>
      <ScrollArea className="h-20">
        <div className="p-3 space-y-3">
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No activity yet
            </p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <Avatar className="h-6 w-6 mt-0.5">
                  <AvatarFallback className="text-xs">
                    {event.user_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{event.user_name}</span>
                    <div className={`flex items-center gap-1 ${getEventColor(event.event_type)}`}>
                      {getEventIcon(event.event_type)}
                      <span className="text-xs">{formatEventMessage(event)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default TimelineFeed;
