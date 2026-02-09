import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface PageNavigationBannerProps {
  title: string;
  leftLabel?: string;
  leftPath?: string;
  rightLabel?: string;
  rightPath?: string;
}

const PageNavigationBanner = ({
  title,
  leftLabel,
  leftPath,
  rightLabel,
  rightPath,
}: PageNavigationBannerProps) => {
  const navigate = useNavigate();

  return (
    <div className="bg-muted/50 border-b">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left Arrow */}
          <div className="flex-1 flex justify-start">
            {leftLabel && leftPath && (
              <Button
                variant="ghost"
                onClick={() => navigate(leftPath)}
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{leftLabel}</span>
              </Button>
            )}
          </div>

          {/* Center Title */}
          <div className="flex-shrink-0">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          </div>

          {/* Right Arrow */}
          <div className="flex-1 flex justify-end">
            {rightLabel && rightPath && (
              <Button
                variant="ghost"
                onClick={() => navigate(rightPath)}
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <span className="hidden sm:inline">{rightLabel}</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageNavigationBanner;
