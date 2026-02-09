import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import FeedbackDialog from "@/components/FeedbackDialog";
import feedbackIcon from "@/assets/feedback-icon.jpg";

const GlobalNav = () => {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === "/dashboard";

  return (
    <>
      <div className="fixed top-0 left-0 z-50 h-full w-14 flex flex-col items-center pt-4 gap-4 bg-sidebar border-r border-sidebar-border shadow-md">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex flex-col items-center gap-0.5 text-sidebar-foreground hover:bg-sidebar-accent rounded-lg p-1.5 transition-colors"
              onClick={() => navigate("/dashboard")}
            >
              <Home className="h-5 w-5" />
              <span className="text-[9px] leading-tight">Home</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Home</TooltipContent>
        </Tooltip>

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
