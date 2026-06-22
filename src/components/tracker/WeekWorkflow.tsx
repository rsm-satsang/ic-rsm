import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export interface UserOpt { id: string; name: string; email: string; }

interface Props {
  week: string; // YYYY-MM-DD Monday
  entry: any | null;
  users: UserOpt[];
  upsert: (week: string, patch: any) => Promise<void>;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

function minusMonthsISO(weekIso: string, months: number): string {
  const d = new Date(weekIso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function defaultDueNotBeforeToday(weekIso: string, monthsBack: number): string {
  const t = todayISO();
  const candidate = minusMonthsISO(weekIso, monthsBack);
  return candidate < t ? t : candidate;
}

function wednesdayOf(weekIso: string): string {
  const d = new Date(weekIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
}

type Panel = null | "assign_plan" | "complete_plan" | "assign_build" | "complete_build" | "assign_op" | "complete_op";

export default function WeekWorkflow({ week, entry, users, upsert }: Props) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>(null);

  // Plan assign
  const [planAssignee, setPlanAssignee] = useState<string>(entry?.plan_assignee_id ?? "");
  const [planDue, setPlanDue] = useState<string>(entry?.plan_due_date ?? defaultDueNotBeforeToday(week, 2));

  // Plan complete
  const [theme, setTheme] = useState<string>(entry?.theme_text ?? "");
  const [planComments, setPlanComments] = useState<string>(entry?.plan_comments ?? "");

  // Build assign
  const [buildAssignee, setBuildAssignee] = useState<string>(entry?.build_assignee_id ?? "");
  const [buildDue, setBuildDue] = useState<string>(entry?.build_due_date ?? defaultDueNotBeforeToday(week, 1));

  // Build complete
  const [draftTitle, setDraftTitle] = useState<string>(entry?.draft_title ?? entry?.title ?? "");

  // Operate assign
  const [opAssignee, setOpAssignee] = useState<string>(entry?.operate_assignee_id ?? "");
  const [opDue, setOpDue] = useState<string>(entry?.operate_due_date ?? wednesdayOf(week));

  // Publish complete
  const [subPub, setSubPub] = useState<boolean>(!!entry?.substack_published);
  const [ytPub, setYtPub] = useState<boolean>(!!entry?.youtube_published);

  const close = () => setPanel(null);

  const submitAssignPlan = async () => {
    if (!planAssignee) return toast.error("Select an assignee");
    await upsert(week, {
      plan_assignee_id: planAssignee,
      plan_due_date: planDue || null,
      status: "planning_assigned",
    });
    toast.success("Planning assigned");
    close();
  };

  const submitCompletePlan = async () => {
    if (!theme.trim()) return toast.error("Enter a theme");
    await upsert(week, {
      theme_text: theme.trim(),
      plan_comments: planComments.trim() || null,
      status: "plan_complete",
    });
    toast.success("Plan completed");
    close();
  };

  const submitAssignBuild = async () => {
    if (!buildAssignee) return toast.error("Select an assignee");
    await upsert(week, {
      build_assignee_id: buildAssignee,
      build_due_date: buildDue || null,
      status: "build_assigned",
    });
    toast.success("Build assigned");
    close();
  };

  const startBuilding = async () => {
    if (!draftTitle.trim()) return toast.error("Enter a draft title");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("Sign in required");
    const { data, error } = await supabase
      .from("projects")
      .insert({ title: draftTitle.trim(), owner_id: user.id, type: "document", status: "in_progress" as any })
      .select()
      .single();
    if (error) return toast.error(error.message);
    await upsert(week, {
      draft_title: draftTitle.trim(),
      title: draftTitle.trim(),
      project_id: (data as any).id,
      status: "build_in_progress",
    });
    toast.success("Build started");
    navigate(`/workspace/${(data as any).id}`);
  };

  const submitAssignOp = async () => {
    if (!opAssignee) return toast.error("Select an assignee");
    await upsert(week, {
      operate_assignee_id: opAssignee,
      operate_due_date: opDue || null,
      status: "operate_assigned",
    });
    toast.success("Operate/Publish assigned");
    close();
  };

  const submitCompletePublish = async () => {
    await upsert(week, {
      substack_published: subPub,
      youtube_published: ytPub,
      status: subPub || ytPub ? "published" : "publish_complete",
    });
    toast.success("Publish updated");
    close();
  };

  const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mt-3 mb-1.5">{children}</div>
  );

  const userSelect = (val: string, onChange: (v: string) => void) => (
    <Select value={val} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
      <SelectContent>
        {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="border-t pt-2">
      {/* PLAN */}
      <SectionHeader>Plan</SectionHeader>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => setPanel(panel === "assign_plan" ? null : "assign_plan")}>
          Assign Planning
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => setPanel(panel === "complete_plan" ? null : "complete_plan")}>
          Complete Planning
        </Button>
      </div>
      {panel === "assign_plan" && (
        <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
          <label className="text-xs font-medium">Due date</label>
          <Input type="date" value={planDue} min={todayISO()} onChange={(e) => setPlanDue(e.target.value)} />
          <label className="text-xs font-medium">Assignee</label>
          {userSelect(planAssignee, setPlanAssignee)}
          <Button size="sm" className="w-full" onClick={submitAssignPlan}>Submit Assignment</Button>
        </div>
      )}
      {panel === "complete_plan" && (
        <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
          <label className="text-xs font-medium">Theme</label>
          <Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Theme" />
          <label className="text-xs font-medium">Plan comments</label>
          <Textarea value={planComments} onChange={(e) => setPlanComments(e.target.value)} className="min-h-[60px] resize-none" />
          <Button size="sm" className="w-full" onClick={submitCompletePlan}>Submit Plan</Button>
        </div>
      )}

      {/* BUILD */}
      <SectionHeader>Build</SectionHeader>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => setPanel(panel === "assign_build" ? null : "assign_build")}>
          Assign Build
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => setPanel(panel === "complete_build" ? null : "complete_build")}>
          Complete Build
        </Button>
      </div>
      {panel === "assign_build" && (
        <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
          <label className="text-xs font-medium">Due date</label>
          <Input type="date" value={buildDue} min={todayISO()} onChange={(e) => setBuildDue(e.target.value)} />
          <label className="text-xs font-medium">Assignee</label>
          {userSelect(buildAssignee, setBuildAssignee)}
          <Button size="sm" className="w-full" onClick={submitAssignBuild}>Submit Build Assignment</Button>
        </div>
      )}
      {panel === "complete_build" && (
        <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
          <label className="text-xs font-medium">Draft title</label>
          <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Draft title" />
          <Button size="sm" className="w-full" onClick={startBuilding}>Start Building</Button>
        </div>
      )}

      {/* OPERATE / PUBLISH */}
      <SectionHeader>Operate / Publish</SectionHeader>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => setPanel(panel === "assign_op" ? null : "assign_op")}>
          Assign Operate/Publish
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => setPanel(panel === "complete_op" ? null : "complete_op")}>
          Complete Publish/Operate
        </Button>
      </div>
      {panel === "assign_op" && (
        <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
          <label className="text-xs font-medium">Due date</label>
          <Input type="date" value={opDue} onChange={(e) => setOpDue(e.target.value)} />
          <label className="text-xs font-medium">Assignee</label>
          {userSelect(opAssignee, setOpAssignee)}
          <Button size="sm" className="w-full" onClick={submitAssignOp}>Submit Assignment</Button>
        </div>
      )}
      {panel === "complete_op" && (
        <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={subPub} onCheckedChange={(v) => setSubPub(!!v)} />
            Published on Substack
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={ytPub} onCheckedChange={(v) => setYtPub(!!v)} />
            Published on YouTube
          </label>
          <Button size="sm" className="w-full" onClick={submitCompletePublish}>Submit Publish</Button>
        </div>
      )}
    </div>
  );
}
