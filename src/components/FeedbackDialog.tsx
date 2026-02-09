import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const questions = [
  "Overall Utility in your work",
  "User experience / Navigation",
  "Functionality of various features",
  "Quality of Output",
];

const FeedbackDialog = ({ open, onOpenChange }: FeedbackDialogProps) => {
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [ratings, setRatings] = useState<Record<number, number | null>>({
    0: null,
    1: null,
    2: null,
    3: null,
  });
  const [comments, setComments] = useState<Record<number, string>>({
    0: "",
    1: "",
    2: "",
    3: "",
  });
  const [generalFeedback, setGeneralFeedback] = useState("");

  const handleRating = (questionIndex: number, value: number) => {
    setRatings((prev) => ({ ...prev, [questionIndex]: value }));
    if (value > 3) {
      setComments((prev) => ({ ...prev, [questionIndex]: "" }));
    }
  };

  const handleSubmit = async () => {
    if (!userName.trim() || !userEmail.trim()) {
      toast.error("Please enter your name and email.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("You must be logged in to submit feedback.");
      return;
    }

    const { error } = await supabase.from("feedback").insert({
      user_id: user.id,
      user_name: userName.trim(),
      user_email: userEmail.trim(),
      ratings,
      comments,
      general_feedback: generalFeedback || null,
    });

    if (error) {
      toast.error("Failed to submit feedback.");
      return;
    }

    toast.success("Thank you for your feedback!");
    setRatings({ 0: null, 1: null, 2: null, 3: null });
    setComments({ 0: "", 1: "", 2: "", 3: "" });
    setGeneralFeedback("");
    setUserName("");
    setUserEmail("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share Your Feedback</DialogTitle>
          <DialogDescription>Rate each area on a scale of 1 to 5.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {questions.map((question, idx) => (
            <div key={idx} className="space-y-2">
              <Label className="text-sm font-semibold">
                {idx + 1}. {question}
              </Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleRating(idx, val)}
                    className={`h-9 w-9 rounded-md text-sm font-medium border transition-colors ${
                      ratings[idx] === val
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border hover:bg-accent"
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
              {ratings[idx] !== null && ratings[idx]! <= 3 && (
                <Textarea
                  placeholder={`Please tell us how we can improve "${question.toLowerCase()}"...`}
                  value={comments[idx]}
                  onChange={(e) =>
                    setComments((prev) => ({
                      ...prev,
                      [idx]: e.target.value,
                    }))
                  }
                  className="mt-1"
                  rows={2}
                />
              )}
            </div>
          ))}

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Additional Comments</Label>
            <Textarea
              placeholder="Let us know if there are any new features or refinements you would like us to make which are not captured in our feedback."
              value={generalFeedback}
              onChange={(e) => setGeneralFeedback(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Submit Feedback</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackDialog;
