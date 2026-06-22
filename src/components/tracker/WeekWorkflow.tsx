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
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

export interface UserOpt { id: string; name: string; email: string; content_roles?: string[] }

interface Props {
  week: string;
  entry: any | null;
  users: UserOpt[];
  planners: UserOpt[];
  builders: UserOpt[];
  operators: UserOpt[];
  upsert: (week: string, patch: any) => Promise<void>;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function minusMonthsISO(weekIso: string, months: number) {
  const d = new Date(weekIso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}
function defaultDueNotBeforeToday(weekIso: string, monthsBack: number) {
  const t = todayISO();
  const c = minusMonthsISO(weekIso, monthsBack);
  return c < t ? t : c;
}
function wednesdayOf(weekIso: string) {
  const d = new Date(weekIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
}
function pickByWeek<T>(arr: T[], weekIso: string): T | null {
  if (!arr.length) return null;
  const n = parseInt(weekIso.replace(/-/g, ""), 10);
  return arr[n % arr.length];
}

type Panel = null | "assign_plan" | "complete_plan" | "assign_build" | "complete_build" | "assign_op" | "complete_op";

type PhaseState = "todo" | "active" | "done";

function phaseStates(status: string): { plan: PhaseState; build: PhaseState; operate: PhaseState } {
  const planDone = ["plan_complete", "build_assigned", "build_in_progress", "operate_assigned", "publish_complete", "published"].includes(status);
  const buildDone = ["build_in_progress", "operate_assigned", "publish_complete", "published"].includes(status);
  const opDone = ["publish_complete", "published"].includes(status);
  return {
    plan: planDone ? "done" : "active",
    build: buildDone ? "done" : planDone ? "active" : "todo",
    operate: opDone ? "done" : buildDone ? "active" : "todo",
  };
}

export default function WeekWorkflow({ week, entry, users, planners, builders, operators, upsert }: Props) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>(null);

  const status = entry?.status ?? "tbd";
  const ps = phaseStates(status);

  const [openPlan, setOpenPlan] = useState(ps.plan === "active");
  const [openBuild, setOpenBuild] = useState(ps.build === "active");
  const [openOp, setOpenOp] = useState(ps.operate === "active");

  // Plan
  const [planAssignee, setPlanAssignee] = useState<string>(entry?.plan_assignee_id ?? "");
  const [planDue, setPlanDue] = useState<string>(entry?.plan_due_date ?? defaultDueNotBeforeToday(week, 2));
  const [theme, setTheme] = useState<string>(entry?.theme_text ?? "");
  const [planComments, setPlanComments] = useState<string>(entry?.plan_comments ?? "");

  // Build
  const [buildAssignee, setBuildAssignee] = useState<string>(entry?.build_assignee_id ?? "");
  const [buildDue, setBuildDue] = useState<string>(entry?.build_due_date ?? defaultDueNotBeforeToday(week, 1));
  const [draftTitle, setDraftTitle] = useState<string>(entry?.draft_title ?? entry?.title ?? "");

  // Operate
  const [opAssignee, setOpAssignee] = useState<string>(entry?.operate_assignee_id ?? "");
  const [opDue, setOpDue] = useState<string>(entry?.operate_due_date ?? wednesdayOf(week));
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
    const autoBuilder = pickByWeek(builders, week);
    const patch: any = {
      theme_text: theme.trim(),
      plan_comments: planComments.trim() || null,
      status: "plan_complete",
    };
    if (autoBuilder) {
      patch.build_assignee_id = autoBuilder.id;
      patch.build_due_date = entry?.build_due_date ?? defaultDueNotBeforeToday(week, 1);
      patch.status = "build_assigned";
    }
    await upsert(week, patch);
    toast.success(autoBuilder ? `Plan complete — Build assigned to ${autoBuilder.name}` : "Plan completed");
    setOpenPlan(false);
    setOpenBuild(true);
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
    const autoOp = pickByWeek(operators, week);
    const patch: any = {
      draft_title: draftTitle.trim(),
      title: draftTitle.trim(),
      project_id: (data as any).id,
      status: "build_in_progress",
    };
    if (autoOp) {
      patch.operate_assignee_id = autoOp.id;
      patch.operate_due_date = entry?.operate_due_date ?? wednesdayOf(week);
      patch.status = "operate_assigned";
    }
    await upsert(week, patch);
    toast.success(autoOp ? `Build started — Operate assigned to ${autoOp.name}` : "Build started");
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

  const userSelect = (val: string, onChange: (v: string) => void, opts: UserOpt[]) => (
    <Select value={val} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
      <SelectContent>
        {(opts.length ? opts : users).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const SectionHeader = ({
    title, state, open, onToggle,
  }: { title: string; state: PhaseState; open: boolean; onToggle: () => void }) => {
    const dot = state === "done" ? "bg-green-500" : state === "active" ? "bg-amber-500" : "bg-gray-300";
    return (
      <CollapsibleTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between py-2 px-2 hover:bg-muted/40 rounded"
        >
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
            <span className="text-sm font-semibold uppercase tracking-wide">{title}</span>
            {state === "done" && <span className="text-xs text-green-700">Complete</span>}
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
    );
  };

  return (
    <div className="border-t pt-2 space-y-1">
      {/* PLAN */}
      <Collapsible open={openPlan} onOpenChange={setOpenPlan}>
        <SectionHeader title="Plan" state={ps.plan} open={openPlan} onToggle={() => setOpenPlan((v) => !v)} />
        <CollapsibleContent className="px-2 pb-2">
          {entry?.plan_assignee_id && (
            <div className="text-xs text-muted-foreground mb-2">
              Assigned to {users.find((u) => u.id === entry.plan_assignee_id)?.name ?? "—"}
              {entry.plan_due_date ? ` · due ${entry.plan_due_date}` : ""}
            </div>
          )}
          {entry?.theme_text && (
            <div className="text-xs mb-2"><b>Theme:</b> {entry.theme_text}</div>
          )}
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
              <label className="text-xs font-medium">Planner</label>
              {userSelect(planAssignee, setPlanAssignee, planners)}
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
        </CollapsibleContent>
      </Collapsible>

      {/* BUILD */}
      <Collapsible open={openBuild} onOpenChange={setOpenBuild}>
        <SectionHeader title="Build" state={ps.build} open={openBuild} onToggle={() => setOpenBuild((v) => !v)} />
        <CollapsibleContent className="px-2 pb-2">
          {entry?.build_assignee_id && (
            <div className="text-xs text-muted-foreground mb-2">
              Assigned to {users.find((u) => u.id === entry.build_assignee_id)?.name ?? "—"}
              {entry.build_due_date ? ` · due ${entry.build_due_date}` : ""}
            </div>
          )}
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
              <label className="text-xs font-medium">Builder</label>
              {userSelect(buildAssignee, setBuildAssignee, builders)}
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
        </CollapsibleContent>
      </Collapsible>

      {/* OPERATE / PUBLISH */}
      <Collapsible open={openOp} onOpenChange={setOpenOp}>
        <SectionHeader title="Operate / Publish" state={ps.operate} open={openOp} onToggle={() => setOpenOp((v) => !v)} />
        <CollapsibleContent className="px-2 pb-2">
          {entry?.operate_assignee_id && (
            <div className="text-xs text-muted-foreground mb-2">
              Assigned to {users.find((u) => u.id === entry.operate_assignee_id)?.name ?? "—"}
              {entry.operate_due_date ? ` · due ${entry.operate_due_date}` : ""}
            </div>
          )}
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
              <label className="text-xs font-medium">Operator</label>
              {userSelect(opAssignee, setOpAssignee, operators)}
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
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
