import { useEffect, useState } from "react";
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
import { ChevronDown, Pencil, Lock } from "lucide-react";
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
function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type Panel =
  | null
  | "edit_plan" | "complete_plan" | "see_plan"
  | "edit_build" | "link_build"
  | "edit_op" | "complete_op";

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
  const planDone = ps.plan === "done";
  const buildDone = ps.build === "done";
  const opDone = ps.operate === "done";

  const [openPlan, setOpenPlan] = useState(ps.plan === "active");
  const [openBuild, setOpenBuild] = useState(planDone && ps.build === "active");
  const [openOp, setOpenOp] = useState(planDone && buildDone && ps.operate === "active");

  // Plan
  const [planAssignee, setPlanAssignee] = useState<string>(entry?.plan_assignee_id ?? "");
  const [planDue, setPlanDue] = useState<string>(entry?.plan_due_date ?? defaultDueNotBeforeToday(week, 2));
  const [theme, setTheme] = useState<string>(entry?.theme_text ?? "");
  const [planComments, setPlanComments] = useState<string>(entry?.plan_comments ?? "");

  // Build
  const [buildAssignee, setBuildAssignee] = useState<string>(entry?.build_assignee_id ?? "");
  const [buildDue, setBuildDue] = useState<string>(entry?.build_due_date ?? defaultDueNotBeforeToday(week, 1));
  const [draftProjects, setDraftProjects] = useState<Array<{ id: string; title: string }>>([]);
  const [linkProjectId, setLinkProjectId] = useState<string>("");

  // Operate
  const [opAssignee, setOpAssignee] = useState<string>(entry?.operate_assignee_id ?? "");
  const [opDue, setOpDue] = useState<string>(entry?.operate_due_date ?? wednesdayOf(week));
  const [subPub, setSubPub] = useState<boolean>(!!entry?.substack_published);
  const [ytPub, setYtPub] = useState<boolean>(!!entry?.youtube_published);

  useEffect(() => {
    if (panel !== "link_build") return;
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,title")
        .order("updated_at", { ascending: false })
        .limit(500);
      setDraftProjects((data as any[]) ?? []);
    })();
  }, [panel]);

  const close = () => setPanel(null);

  const submitEditPlan = async () => {
    if (!planAssignee) return toast.error("Select an assignee");
    await upsert(week, {
      plan_assignee_id: planAssignee,
      plan_due_date: planDue || null,
      ...(entry?.status ? {} : { status: "planning_assigned" }),
    });
    toast.success("Planning updated");
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
      patch.build_assignee_id = entry?.build_assignee_id ?? autoBuilder.id;
      patch.build_due_date = entry?.build_due_date ?? defaultDueNotBeforeToday(week, 1);
      patch.status = "build_assigned";
    }
    await upsert(week, patch);
    toast.success(autoBuilder ? `Plan complete — Build assigned to ${autoBuilder.name}` : "Plan completed");
    setOpenPlan(false);
    setOpenBuild(true);
    close();
  };

  const submitEditBuild = async () => {
    if (!buildAssignee) return toast.error("Select an assignee");
    await upsert(week, {
      build_assignee_id: buildAssignee,
      build_due_date: buildDue || null,
    });
    toast.success("Build updated");
    close();
  };

  const autoAssignOpPatch = () => {
    const autoOp = pickByWeek(operators, week);
    if (!autoOp) return { status: "build_in_progress" as const };
    return {
      operate_assignee_id: entry?.operate_assignee_id ?? autoOp.id,
      operate_due_date: entry?.operate_due_date ?? wednesdayOf(week),
      status: "operate_assigned" as const,
    };
  };

  const startBuildFromScratch = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("Sign in required");
    const title = entry?.title || `Week of ${week}`;
    const { data, error } = await supabase
      .from("projects")
      .insert({ title, owner_id: user.id, type: "document", status: "in_progress" as any })
      .select()
      .single();
    if (error) return toast.error(error.message);
    const projectId = (data as any).id;
    await upsert(week, { project_id: projectId, title, ...autoAssignOpPatch() });
    toast.success("Project created");
    navigate(`/project/${projectId}/intake`);
  };

  const linkProject = async () => {
    if (!linkProjectId) return toast.error("Select a project");
    const proj = draftProjects.find((p) => p.id === linkProjectId);
    await upsert(week, {
      project_id: linkProjectId,
      ...(proj?.title ? { title: proj.title } : {}),
      ...autoAssignOpPatch(),
    });
    toast.success("Project linked");
    navigate(`/workspace/${linkProjectId}`);
  };

  const openLinkedReview = () => {
    if (entry?.project_id) navigate(`/workspace/${entry.project_id}`);
  };

  const submitEditOp = async () => {
    if (!opAssignee) return toast.error("Select an assignee");
    await upsert(week, {
      operate_assignee_id: opAssignee,
      operate_due_date: opDue || null,
    });
    toast.success("Operate/Publish updated");
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
    title, state, open, onToggle, disabled,
  }: { title: string; state: PhaseState; open: boolean; onToggle: () => void; disabled?: boolean }) => {
    const dot = state === "done" ? "bg-green-500" : state === "active" ? "bg-amber-500" : "bg-gray-300";
    return (
      <CollapsibleTrigger asChild>
        <button
          type="button"
          onClick={() => { if (!disabled) onToggle(); }}
          disabled={disabled}
          className={`w-full flex items-center justify-between py-2 px-2 rounded ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/40"}`}
        >
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
            <span className="text-sm font-semibold uppercase tracking-wide">{title}</span>
            {state === "done" && <span className="text-xs text-green-700">Complete</span>}
            {disabled && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Locked until plan is complete</span>}
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
    );
  };

  const AssignmentLine = ({
    assigneeId, due, onEdit, editing,
  }: { assigneeId?: string | null; due?: string | null; onEdit: () => void; editing: boolean }) => {
    if (!assigneeId) return null;
    const name = users.find((u) => u.id === assigneeId)?.name ?? "—";
    return (
      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2 flex-wrap">
        <span>Assigned to <b>{name}</b>{due ? ` · due ${due}` : ""}</span>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onEdit}>
          <Pencil className="h-3 w-3 mr-1" />
          {editing ? "Close" : "Reassign / Edit Due date"}
        </Button>
      </div>
    );
  };

  return (
    <div className="border-t pt-2 space-y-1">
      {/* PLAN */}
      <Collapsible open={openPlan} onOpenChange={setOpenPlan}>
        <SectionHeader title="Plan" state={ps.plan} open={openPlan} onToggle={() => setOpenPlan((v) => !v)} />
        <CollapsibleContent className="px-2 pb-2">
          <AssignmentLine
            assigneeId={entry?.plan_assignee_id}
            due={entry?.plan_due_date}
            editing={panel === "edit_plan"}
            onEdit={() => setPanel(panel === "edit_plan" ? null : "edit_plan")}
          />

          {panel === "edit_plan" && (
            <div className="mb-2 space-y-2 rounded-md border bg-muted/30 p-2">
              <label className="text-xs font-medium">Due date</label>
              <Input type="date" value={planDue} min={todayISO()} onChange={(e) => setPlanDue(e.target.value)} />
              <label className="text-xs font-medium">Planner</label>
              {userSelect(planAssignee, setPlanAssignee, planners)}
              <Button size="sm" className="w-full" onClick={submitEditPlan}>Save</Button>
            </div>
          )}

          {planDone ? (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span>
                Plan completed by <b>{users.find((u) => u.id === entry?.plan_assignee_id)?.name ?? "—"}</b>
                {entry?.updated_at ? ` on ${fmtDate(entry.updated_at)}` : ""}
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPanel(panel === "see_plan" ? null : "see_plan")}>
                See Plan
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPanel(panel === "complete_plan" ? null : "complete_plan")}>
                Redo planning
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="w-full" onClick={() => setPanel(panel === "complete_plan" ? null : "complete_plan")}>
              Complete Planning
            </Button>
          )}

          {panel === "see_plan" && planDone && (
            <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2 text-xs">
              <div><b>Theme:</b> {entry?.theme_text || "—"}</div>
              <div><b>Plan comments:</b> {entry?.plan_comments || "—"}</div>
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
      <Collapsible open={openBuild && planDone} onOpenChange={(v) => { if (planDone) setOpenBuild(v); }}>
        <SectionHeader title="Build" state={ps.build} open={openBuild && planDone} onToggle={() => setOpenBuild((v) => !v)} disabled={!planDone} />
        <CollapsibleContent className="px-2 pb-2">
          <AssignmentLine
            assigneeId={entry?.build_assignee_id}
            due={entry?.build_due_date}
            editing={panel === "edit_build"}
            onEdit={() => setPanel(panel === "edit_build" ? null : "edit_build")}
          />
          {panel === "edit_build" && (
            <div className="mb-2 space-y-2 rounded-md border bg-muted/30 p-2">
              <label className="text-xs font-medium">Due date</label>
              <Input type="date" value={buildDue} min={todayISO()} onChange={(e) => setBuildDue(e.target.value)} />
              <label className="text-xs font-medium">Builder</label>
              {userSelect(buildAssignee, setBuildAssignee, builders)}
              <Button size="sm" className="w-full" onClick={submitEditBuild}>Save</Button>
            </div>
          )}

          {entry?.project_id ? (
            <Button size="sm" variant="outline" className="w-full" onClick={openLinkedReview}>
              Open Linked Project (Review)
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={startBuildFromScratch}>
                Start Building from scratch
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPanel(panel === "link_build" ? null : "link_build")}>
                Link a Project
              </Button>
            </div>
          )}

          {panel === "link_build" && !entry?.project_id && (
            <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
              <label className="text-xs font-medium">Draft project</label>
              <Select value={linkProjectId} onValueChange={setLinkProjectId}>
                <SelectTrigger><SelectValue placeholder="Select a draft project" /></SelectTrigger>
                <SelectContent>
                  {draftProjects.length === 0 && <div className="p-2 text-xs text-muted-foreground">No draft projects</div>}
                  {draftProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" className="w-full" onClick={linkProject}>Link & Open</Button>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* OPERATE / PUBLISH */}
      <Collapsible open={openOp && planDone} onOpenChange={(v) => { if (planDone) setOpenOp(v); }}>
        <SectionHeader title="Operate / Publish" state={ps.operate} open={openOp && planDone} onToggle={() => setOpenOp((v) => !v)} disabled={!planDone} />
        <CollapsibleContent className="px-2 pb-2">
          <AssignmentLine
            assigneeId={entry?.operate_assignee_id}
            due={entry?.operate_due_date}
            editing={panel === "edit_op"}
            onEdit={() => setPanel(panel === "edit_op" ? null : "edit_op")}
          />
          {panel === "edit_op" && (
            <div className="mb-2 space-y-2 rounded-md border bg-muted/30 p-2">
              <label className="text-xs font-medium">Due date</label>
              <Input type="date" value={opDue} onChange={(e) => setOpDue(e.target.value)} />
              <label className="text-xs font-medium">Operator</label>
              {userSelect(opAssignee, setOpAssignee, operators)}
              <Button size="sm" className="w-full" onClick={submitEditOp}>Save</Button>
            </div>
          )}

          {opDone ? (
            <div className="text-xs">Publishing complete.</div>
          ) : (
            <Button size="sm" variant="outline" className="w-full" onClick={() => setPanel(panel === "complete_op" ? null : "complete_op")}>
              Complete Publish/Operate
            </Button>
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
