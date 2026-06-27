import { useEffect, useState, useCallback } from "react";
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
import { ChevronDown, Pencil, Lock, History, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export interface UserOpt { id: string; name: string; email: string; content_roles?: string[] }

interface Props {
  week: string;
  channel: string;
  subChannel: string;
  entry: any | null;
  users: UserOpt[];
  planners: UserOpt[];
  builders: UserOpt[];
  operators: UserOpt[];
  isAdmin?: boolean;
  projectStatus?: string | null;
  upsert: (week: string, patch: any) => Promise<any>;
  onReset?: (week: string) => Promise<void>;
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
function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

type Panel =
  | null
  | "edit_plan" | "complete_plan" | "see_plan"
  | "edit_build" | "link_build"
  | "edit_op" | "complete_op";

type PhaseState = "todo" | "active" | "done";

function phaseStates(status: string, projectStatus?: string | null): { plan: PhaseState; build: PhaseState; operate: PhaseState } {
  const planDone = ["plan_complete", "build_assigned", "build_in_progress", "operate_assigned", "publish_complete", "published"].includes(status);
  const projectReady = projectStatus === "approved" || projectStatus === "published";
  const buildDoneFromStatus = ["operate_assigned", "publish_complete", "published"].includes(status);
  const buildDone = buildDoneFromStatus || (planDone && projectReady);
  const opDone = ["publish_complete", "published"].includes(status);
  return {
    plan: planDone ? "done" : "active",
    build: buildDone ? "done" : planDone ? "active" : "todo",
    operate: opDone ? "done" : buildDone ? "active" : "todo",
  };
}

export default function WeekWorkflow({ week, channel, subChannel, entry, users, planners, builders, operators, isAdmin, projectStatus, upsert, onReset }: Props) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>(null);

  const status = entry?.status ?? "tbd";
  const ps = phaseStates(status, projectStatus);
  const planDone = ps.plan === "done";
  const buildDone = ps.build === "done";
  const opDone = ps.operate === "done";

  const [openPlan, setOpenPlan] = useState(ps.plan === "active");
  const [openBuild, setOpenBuild] = useState(planDone && ps.build === "active");
  const [openOp, setOpenOp] = useState(planDone && buildDone && ps.operate === "active");
  const [openActivity, setOpenActivity] = useState(false);

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

  // Activity timeline
  const [activity, setActivity] = useState<any[]>([]);
  const loadActivity = useCallback(async () => {
    const { data } = await supabase
      .from("tracker_activity" as any)
      .select("*")
      .eq("channel", channel)
      .eq("sub_channel", subChannel)
      .eq("week_start_date", week)
      .order("created_at", { ascending: false })
      .limit(100);
    setActivity((data as any[]) ?? []);
  }, [channel, subChannel, week]);
  useEffect(() => { loadActivity(); }, [loadActivity]);

  // Build progress metrics for linked project
  const [buildProgress, setBuildProgress] = useState<{
    draftCount: number;
    commentCount: number;
    lastCommentBy: string | null;
    lastCommentAt: string | null;
    reviewersNotifiedAt: string | null;
  }>({ draftCount: 0, commentCount: 0, lastCommentBy: null, lastCommentAt: null, reviewersNotifiedAt: null });

  useEffect(() => {
    const pid = entry?.project_id;
    if (!pid) {
      setBuildProgress({ draftCount: 0, commentCount: 0, lastCommentBy: null, lastCommentAt: null, reviewersNotifiedAt: null });
      return;
    }
    (async () => {
      const [versionsRes, commentsRes, timelineRes] = await Promise.all([
        supabase.from("versions").select("id", { count: "exact", head: true }).eq("project_id", pid),
        supabase.from("comments").select("id,created_at,user_id", { count: "exact" }).eq("project_id", pid).order("created_at", { ascending: false }).limit(1),
        supabase.from("timeline").select("created_at").eq("project_id", pid).eq("event_type", "review_requested" as any).order("created_at", { ascending: false }).limit(1),
      ]);
      let lastBy: string | null = null;
      const last = commentsRes.data?.[0];
      if (last?.user_id) {
        const { data: u } = await supabase.from("users").select("name").eq("id", last.user_id).maybeSingle();
        lastBy = u?.name ?? null;
      }
      setBuildProgress({
        draftCount: versionsRes.count ?? 0,
        commentCount: commentsRes.count ?? 0,
        lastCommentBy: lastBy,
        lastCommentAt: last?.created_at ?? null,
        reviewersNotifiedAt: (timelineRes.data?.[0] as any)?.created_at ?? null,
      });
    })();
  }, [entry?.project_id, projectStatus, activity.length]);


  const logActivity = useCallback(async (action: string, details: Record<string, any> = {}) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const me = users.find((u) => u.id === user.id);
    await supabase.from("tracker_activity" as any).insert({
      channel, sub_channel: subChannel, week_start_date: week,
      tracker_entry_id: entry?.id ?? null,
      user_id: user.id,
      user_name: me?.name ?? me?.email ?? user.email ?? "Unknown",
      action,
      details,
    });
    loadActivity();
  }, [channel, subChannel, week, entry?.id, users, loadActivity]);

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
    await logActivity("plan_assigned", { assignee: users.find(u => u.id === planAssignee)?.name, due: planDue });
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
    await logActivity("plan_completed", { theme: theme.trim(), auto_builder: autoBuilder?.name ?? null });
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
    await logActivity("build_assigned", { assignee: users.find(u => u.id === buildAssignee)?.name, due: buildDue });
    toast.success("Build updated");
    close();
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
    await upsert(week, { project_id: projectId, title, status: "build_in_progress" });
    await logActivity("build_project_created", { project_id: projectId, title });
    toast.success("Project created");
    navigate(`/project/${projectId}/intake`);
  };

  const linkProject = async () => {
    if (!linkProjectId) return toast.error("Select a project");
    const proj = draftProjects.find((p) => p.id === linkProjectId);
    await upsert(week, {
      project_id: linkProjectId,
      ...(proj?.title ? { title: proj.title } : {}),
      status: "build_in_progress",
    });
    await logActivity("build_project_linked", { project_id: linkProjectId, title: proj?.title });
    toast.success("Project linked");
    navigate(`/workspace/${linkProjectId}`);
  };

  const openLinkedReview = () => {
    if (entry?.project_id) navigate(`/workspace/${entry.project_id}`);
  };

  // Auto-assign operator + sync status when build becomes done (project marked ready to publish)
  useEffect(() => {
    if (!buildDone || !entry?.id) return;
    const needsOp = !entry.operate_assignee_id;
    const needsStatusBump = !["operate_assigned", "publish_complete", "published"].includes(entry.status);
    if (!needsOp && !needsStatusBump) return;
    const autoOp = needsOp ? pickByWeek(operators, week) : null;
    (async () => {
      const patch: any = { status: "operate_assigned" };
      if (autoOp) {
        patch.operate_assignee_id = autoOp.id;
        patch.operate_due_date = entry.operate_due_date ?? wednesdayOf(week);
      }
      await upsert(week, patch);
      await logActivity("build_complete_auto", { project_status: projectStatus, auto_operator: autoOp?.name ?? null });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildDone, entry?.id, projectStatus]);


  const submitEditOp = async () => {
    if (!opAssignee) return toast.error("Select an assignee");
    await upsert(week, {
      operate_assignee_id: opAssignee,
      operate_due_date: opDue || null,
    });
    await logActivity("operate_assigned", { assignee: users.find(u => u.id === opAssignee)?.name, due: opDue });
    toast.success("Operate/Publish updated");
    close();
  };

  const submitCompletePublish = async () => {
    const newStatus = subPub || ytPub ? "published" : "publish_complete";
    await upsert(week, {
      substack_published: subPub,
      youtube_published: ytPub,
      status: newStatus,
    });
    await logActivity("publish_completed", { substack: subPub, youtube: ytPub });
    toast.success("Publish updated");
    close();
  };

  const handleReset = async () => {
    if (!onReset) return;
    if (!confirm("Reset all updates for this week? Activity history will be preserved.")) return;
    await onReset(week);
    await logActivity("week_reset", {});
    toast.success("Week reset");
  };

  const userSelect = (val: string, onChange: (v: string) => void, opts: UserOpt[]) => (
    <Select value={val} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select assignee" /></SelectTrigger>
      <SelectContent>
        {opts.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">No eligible users — assign the role in Users.</div>
        ) : (
          opts.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)
        )}
      </SelectContent>
    </Select>
  );

  const SectionHeader = ({
    title, state, open, onToggle, disabled, stateLabel,
  }: { title: string; state: PhaseState; open: boolean; onToggle: () => void; disabled?: boolean; stateLabel?: string }) => {
    const dot = state === "done" ? "bg-green-500" : state === "active" ? "bg-amber-500" : "bg-gray-300";
    const labelCls = state === "done" ? "text-green-700" : state === "active" ? "text-amber-700" : "text-gray-600";
    return (
      <CollapsibleTrigger asChild>
        <button
          type="button"
          onClick={() => { if (!disabled) onToggle(); }}
          disabled={disabled}
          className={`w-full flex items-center justify-between py-2 px-2 rounded ${disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-muted/40"}`}
        >
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
            <span className="text-sm font-semibold uppercase tracking-wide">{title}</span>
            {stateLabel && <span className={`text-xs font-medium ${labelCls}`}>{stateLabel}</span>}
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
    );
  };

  const planLabel = ps.plan === "done" ? "Complete" : "Assigned";
  const buildLabel = ps.build === "done" ? "Complete" : ps.build === "active" ? (entry?.project_id ? "In-progress" : "Assigned") : "Awaiting Plan";
  const operateLabel = ps.operate === "done" ? "Complete" : ps.operate === "active" ? "Assigned" : "Awaiting Build";

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
      {isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={handleReset}>
            <RotateCcw className="h-3 w-3 mr-1" /> Reset week (admin)
          </Button>
        </div>
      )}
      {/* PLAN */}
      <Collapsible open={openPlan} onOpenChange={setOpenPlan}>
        <SectionHeader title="Plan" state={ps.plan} open={openPlan} onToggle={() => setOpenPlan((v) => !v)} stateLabel={planLabel} />
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
        <SectionHeader title="Build" state={ps.build} open={openBuild && planDone} onToggle={() => setOpenBuild((v) => !v)} disabled={!planDone} stateLabel={buildLabel} />
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

          {entry?.project_id && (
            <div className="text-xs text-muted-foreground mb-2">
              Linked project status: <b>{projectStatus ?? "—"}</b>
              {buildDone ? " · Build complete (project ready to publish)" : " · Build will complete when project is marked Ready to Publish"}
            </div>
          )}

          {entry?.project_id && (
            <div className="mb-2 rounded-md border bg-amber-50/60 p-2 text-xs space-y-0.5">
              <div className="font-semibold text-amber-900 mb-1">Build progress</div>
              <div>📝 Drafts generated: <b>{buildProgress.draftCount}</b></div>
              <div>💬 Review comments: <b>{buildProgress.commentCount}</b>
                {buildProgress.lastCommentBy && (
                  <> · last by <b>{buildProgress.lastCommentBy}</b> {buildProgress.lastCommentAt ? `(${fmtDateTime(buildProgress.lastCommentAt)})` : ""}</>
                )}
              </div>
              <div>📧 Reviewers notified: <b>{buildProgress.reviewersNotifiedAt ? `Yes · ${fmtDateTime(buildProgress.reviewersNotifiedAt)}` : "No"}</b></div>
            </div>
          )}



          {entry?.project_id ? (
            <div className="space-y-2">
              <Button size="sm" variant="outline" className="w-full" onClick={openLinkedReview}>
                Open Linked Project: {entry?.title || "(untitled)"}
              </Button>
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline"
                onClick={() => setPanel(panel === "link_build" ? null : "link_build")}
              >
                Link a different project
              </button>
            </div>
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


          {panel === "link_build" && (
            <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
              <label className="text-xs font-medium">{entry?.project_id ? "Link a different project" : "Project"}</label>
              <Select value={linkProjectId} onValueChange={setLinkProjectId}>
                <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                <SelectContent>
                  {draftProjects.length === 0 && <div className="p-2 text-xs text-muted-foreground">No projects found</div>}
                  {draftProjects.filter((p) => p.id !== entry?.project_id).map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" className="w-full" onClick={linkProject}>Link & Open</Button>
            </div>
          )}

        </CollapsibleContent>
      </Collapsible>

      {/* OPERATE / PUBLISH */}
      {(() => {
        const opAllowed = planDone && !!entry?.operate_assignee_id;
        return (
      <Collapsible open={openOp && opAllowed} onOpenChange={(v) => { if (opAllowed) setOpenOp(v); }}>
        <SectionHeader title="Operate / Publish" state={ps.operate} open={openOp && opAllowed} onToggle={() => setOpenOp((v) => !v)} disabled={!opAllowed} stateLabel={operateLabel} />
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
        );
      })()}



      {/* ACTIVITY TIMELINE */}
      <Collapsible open={openActivity} onOpenChange={setOpenActivity}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between py-2 px-2 rounded hover:bg-muted/40"
          >
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold uppercase tracking-wide">Activity ({activity.length})</span>
            </div>
            <ChevronDown className={`h-4 w-4 transition-transform ${openActivity ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-2 pb-2">
          {activity.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">No activity yet.</div>
          ) : (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {activity.map((a) => (
                <li key={a.id} className="text-xs border-l-2 border-muted pl-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span><b>{a.user_name ?? "Someone"}</b> · {a.action}</span>
                    <span className="text-muted-foreground tabular-nums">{fmtDateTime(a.created_at)}</span>
                  </div>
                  {a.details && Object.keys(a.details).length > 0 && (
                    <div className="text-muted-foreground text-[11px] mt-0.5">
                      {Object.entries(a.details).map(([k, v]) => (
                        <span key={k} className="mr-2">{k}: <b>{String(v)}</b></span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
