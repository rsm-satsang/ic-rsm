import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, Calendar, ShieldCheck, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import FeedbackDialog from "@/components/FeedbackDialog";
import feedbackIcon from "@/assets/feedback-icon.jpg";
import { supabase } from "@/integrations/supabase/client";

const GlobalNav = () => {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
      setIsAdmin((data as any)?.role === "admin");
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null);
      setUnread(count || 0);
    })();
  }, [location.pathname]);

  if (location.pathname === "/auth" || location.pathname === "/reset-password") return null;

  const NavButton = ({ icon: Icon, label, to, badge }: any) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="relative flex flex-col items-center gap-0.5 text-sidebar-foreground hover:bg-sidebar-accent rounded-lg p-1.5 transition-colors"
          onClick={() => navigate(to)}
        >
          <Icon className="h-5 w-5" />
          <span className="text-[9px] leading-tight">{label}</span>
          {badge ? (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full px-1 min-w-[14px] h-[14px] flex items-center justify-center">
              {badge}
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <>
      <div className="fixed top-0 left-0 z-50 h-full w-14 flex flex-col items-center pt-4 gap-4 bg-sidebar border-r border-sidebar-border shadow-md">
        <NavButton icon={Home} label="Home" to="/dashboard" />
        <NavButton icon={Calendar} label="Tracker" to="/tracker" />
        <NavButton icon={Bell} label="Alerts" to="/notifications" badge={unread || null} />
        {isAdmin && <NavButton icon={ShieldCheck} label="Users" to="/admin/users" />}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex flex-col items-center gap-0.5 text-sidebar-foreground hover:bg-sidebar-accent rounded-lg p-1.5 transition-colors"
              onClick={() => setFeedbackOpen(true)}
            >
              <img src={feedbackIcon} alt="Feedback" className="h-5 w-5 rounded" />
              <span className="text-[9px] leading-tight">Feedback</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Feedback</TooltipContent>
        </Tooltip>
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
};

export default GlobalNav;
