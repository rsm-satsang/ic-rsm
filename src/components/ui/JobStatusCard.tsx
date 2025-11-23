import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Image, 
  Video, 
  Music, 
  Youtube, 
  Link as LinkIcon,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Trash2,
  Eye,
  RefreshCw
} from "lucide-react";
import { ReferenceFile } from "@/lib/api/intake";

interface JobStatusCardProps {
  file: ReferenceFile;
  onDelete?: (fileId: string) => void;
  onRetry?: (fileId: string) => void;
  onViewExtracted?: (file: ReferenceFile) => void;
}

const getFileIcon = (fileType: string | null) => {
  if (!fileType) return <FileText className="h-5 w-5" />;
  
  const iconClass = "h-5 w-5";
  if (fileType === "image") return <Image className={iconClass} />;
  if (fileType === "video") return <Video className={iconClass} />;
  if (fileType === "audio") return <Music className={iconClass} />;
  if (fileType === "youtube") return <Youtube className={iconClass} />;
  if (fileType === "url") return <LinkIcon className={iconClass} />;
  return <FileText className={iconClass} />;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "done":
      return (
        <Badge variant="default" className="bg-green-500/10 text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Complete
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    case "extracting":
      return (
        <Badge variant="secondary">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Extracting
        </Badge>
      );
    case "queued":
      return (
        <Badge variant="outline">
          <Clock className="h-3 w-3 mr-1" />
          Queued
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export const JobStatusCard = ({ file, onDelete, onRetry, onViewExtracted }: JobStatusCardProps) => {
  const extractedPreview = file.extracted_text?.slice(0, 150);
  const hasExtractedText = file.extracted_text && file.extracted_text.length > 0;

  return (
    <Card className="p-3 w-full">
      <div className="flex items-start gap-3">
        <div className="text-muted-foreground mt-1 flex-shrink-0">
          {getFileIcon(file.file_type)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium truncate">
                {file.file_name || "Unnamed file"}
              </h4>
              {file.size_bytes && (
                <p className="text-xs text-muted-foreground">
                  {(file.size_bytes / 1024 / 1024).toFixed(2)} MB
                </p>
              )}
            </div>
            <div className="flex-shrink-0">
              {getStatusBadge(file.status)}
            </div>
          </div>

          {file.error_text && (
            <p className="text-xs text-destructive mb-2 line-clamp-2 break-words">
              {file.error_text}
            </p>
          )}

          {hasExtractedText && (
            <p className="text-xs text-muted-foreground line-clamp-3 mb-2 break-words">
              {extractedPreview}...
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1">
            {file.status === "failed" && onRetry && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRetry(file.id)}
                className="h-7 text-xs px-2"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            )}
            
            {hasExtractedText && onViewExtracted && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onViewExtracted(file)}
                className="h-7 text-xs px-2"
              >
                <Eye className="h-3 w-3 mr-1" />
                View
              </Button>
            )}
            
            {onDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(file.id)}
                className="h-7 text-xs px-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};
