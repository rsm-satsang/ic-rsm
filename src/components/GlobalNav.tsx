import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import FeedbackDialog from "@/components/FeedbackDialog";

const GlobalNav = () => {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === "/dashboard";

  return (
    <>
      <div className="fixed top-4 left-4 z-50 flex flex-col gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isHome ? "default" : "outline"}
              size="icon"
              className="rounded-full shadow-md"
              onClick={() => navigate("/dashboard")}
            >
              <Home className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Home</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full shadow-md"
              onClick={() => setFeedbackOpen(true)}
            >
              <MessageSquareText className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Feedback</TooltipContent>
        </Tooltip>
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
};

export default GlobalNav;
