import { useEffect, useState, useCallback, useMemo } from "react";
import { DRAFT_STAGES, getDraftStage, stageLabel } from "@/lib/draftStages";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ChevronDown, Pencil, Lock, History, RotateCcw, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@/lib/datetime";

function DatePicker({ value, onChange, min }: { value?: string; onChange: (iso: string) => void; min?: string }) {
  const selected = value ? new Date(value + "T00:00:00") : undefined;
  const minDate = min ? new Date(min + "T00:00:00") : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-start text-left font-normal h-10", !selected && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected
            ? formatDate(selected)
            : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (!d) return;
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            onChange(iso);
          }}
          disabled={minDate ? (d) => d < minDate : undefined}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface UserOpt { id: string; name: string; email: string; content_roles?: string[] }

// Content types a planner can pick for a week
export const CONTENT_TYPES: { value: string; label: string }[] = [
  { value: "substack_newsletter", label: "Substack Newsletter" },
  { value: "wordpress_blog", label: "WordPress Blog" },
  { value: "long_form_video", label: "Long form Video" },
  { value: "shorts_reels", label: "Shorts / Reels" },
  { value: "daily_inspiration", label: "Daily Inspiration" },
  { value: "other", label: "Other" },
];
export const contentTypeLabel = (v?: string | null) =>
  CONTENT_TYPES.find((c) => c.value === v)?.label ?? (v ? v.replace(/_/g, " ") : null);


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
  projectStage?: string | null;
  upsert: (week: string, patch: any) => Promise<any>;
  onReset?: (week: string) => Promise<void>;
  /** External request (e.g. from the calendar) to open a specific panel. */
  panelRequest?: { key: string; nonce: number } | null;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function minusMonthsISO(weekIso: string, months: number) {
  const d = new Date(weekIso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}
// Due dates are always relative to the week itself — never clamped to today,
// so past weeks keep their own (past) due dates.
function defaultDueNotBeforeToday(weekIso: string, monthsBack: number) {
  return minusMonthsISO(weekIso, monthsBack);
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
// Default planner / publisher (operator) is always Sangeeta ji when available.
function pickDefaultAssignee<T extends { name?: string | null }>(arr: T[], weekIso: string): T | null {
  const sangeeta = arr.find((u) => (u.name || "").toLowerCase().includes("sangeeta"));
  return sangeeta ?? pickByWeek(arr, weekIso);
}

function fmtDate(iso?: string | null) {
  return formatDate(iso);
}
function fmtDateTime(iso?: string | null) {
  return formatDateTime(iso);
}

type Panel =
  | null
  | "edit_plan" | "complete_plan" | "see_plan"
  | "edit_build" | "link_build"
  | "edit_op" | "complete_op";

type PhaseState = "todo" | "active" | "done";

function phaseStates(status: string, projectStatus?: string | null, projectStage?: string | null): { plan: PhaseState; build: PhaseState; operate: PhaseState } {
  const stagePublished = projectStage === "s9_published";
  const planDone = ["plan_complete", "build_assigned", "build_in_progress", "operate_assigned", "publish_complete", "published"].includes(status) || stagePublished;
  const projectReady = projectStatus === "approved" || projectStatus === "published";
  const buildDoneFromStatus = ["operate_assigned", "publish_complete", "published"].includes(status);
  const buildDone = buildDoneFromStatus || (planDone && projectReady) || stagePublished;
  const opDone = ["publish_complete", "published"].includes(status) || stagePublished;
  return {
    plan: planDone ? "done" : "active",
    build: buildDone ? "done" : planDone ? "active" : "todo",
    operate: opDone ? "done" : buildDone ? "active" : "todo",
  };
}

export default function WeekWorkflow({ week, channel, subChannel, entry, users, planners, builders, operators, isAdmin, projectStatus, projectStage, upsert, onReset, panelRequest }: Props) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>(null);

  const status = entry?.status ?? "tbd";
  const ps = phaseStates(status, projectStatus, projectStage);
  const planDone = ps.plan === "done";
  const buildDone = ps.build === "done";
  const opDone = ps.operate === "done";

  const [openPlan, setOpenPlan] = useState(ps.plan === "active");
  const [openBuild, setOpenBuild] = useState(planDone && ps.build === "active");
  const [openOp, setOpenOp] = useState(planDone && buildDone && ps.operate === "active");
  const [openActivity, setOpenActivity] = useState(false);

  // Open a panel when the calendar (or any parent) asks for it.
  useEffect(() => {
    if (!panelRequest?.key) return;
    const key = panelRequest.key as Panel;
    setPanel(key);
    if (key === "edit_plan" || key === "complete_plan" || key === "see_plan") setOpenPlan(true);
    if (key === "edit_build" || key === "link_build") { setOpenPlan(true); setOpenBuild(true); }
    if (key === "edit_op" || key === "complete_op") { setOpenPlan(true); setOpenBuild(true); setOpenOp(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelRequest?.nonce]);



  // Plan
  const [planAssignees, setPlanAssignees] = useState<string[]>(
    ((entry as any)?.plan_assignee_ids as string[] | null) ?? (entry?.plan_assignee_id ? [entry.plan_assignee_id] : [])
  );
  const [planDue, setPlanDue] = useState<string>(entry?.plan_due_date ?? defaultDueNotBeforeToday(week, 2));
  const [theme, setTheme] = useState<string>(entry?.theme_text ?? "");
  const [planComments, setPlanComments] = useState<string>(entry?.plan_comments ?? "");
  const [contentType, setContentType] = useState<string>((entry as any)?.content_type ?? "substack_newsletter");


  // Build
  const [buildAssignees, setBuildAssignees] = useState<string[]>(
    ((entry as any)?.build_assignee_ids as string[] | null) ?? (entry?.build_assignee_id ? [entry.build_assignee_id] : [])
  );
  const [buildDue, setBuildDue] = useState<string>(entry?.build_due_date ?? defaultDueNotBeforeToday(week, 1));
  const [draftProjects, setDraftProjects] = useState<Array<{ id: string; title: string }>>([]);
  const [linkProjectId, setLinkProjectId] = useState<string>("");
  const [planLinkProjectId, setPlanLinkProjectId] = useState<string>("");

  // Operate
  const [opAssignees, setOpAssignees] = useState<string[]>(
    ((entry as any)?.operate_assignee_ids as string[] | null) ?? (entry?.operate_assignee_id ? [entry.operate_assignee_id] : [])
  );
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
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,title,status,metadata,type")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) {
        console.error("[WeekWorkflow] projects fetch failed", error);
        return;
      }
      setDraftProjects((data as any[]) ?? []);
    })();
  }, []);

  // Planner may only link newsletters whose concept has been approved and which
  // are not yet published.
  const plannableProjects = useMemo(() => {
    const order = DRAFT_STAGES.map((s) => s.value);
    const minIdx = order.indexOf("s4_concept_approved");
    return draftProjects.filter((p: any) => {
      if ((p.metadata as any)?.goal !== "substack_newsletter") return false;
      if (p.status === "published") return false;
      const stage = getDraftStage(p.metadata, p.status);
      if (stage === "s9_published") return false;
      return order.indexOf(stage) >= minIdx;
    });
  }, [draftProjects]);



  const close = () => setPanel(null);

  const submitEditPlan = async () => {
    if (planAssignees.length === 0) return toast.error("Select at least one assignee");
    await upsert(week, {
      plan_assignee_ids: planAssignees,
      plan_assignee_id: planAssignees[0], // legacy mirror
      plan_due_date: planDue || null,
      ...(entry?.status ? {} : { status: "planning_assigned" }),
    });
    await logActivity("plan_assigned", { assignees: planAssignees.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(", "), due: planDue });
    toast.success("Planning updated");
    close();
  };

  const submitCompletePlan = async () => {
    if (!contentType) return toast.error("Select a content type for the week");
    const autoBuilder = pickByWeek(builders, week);
    const existingBuild = ((entry as any)?.build_assignee_ids as string[] | null) ?? (entry?.build_assignee_id ? [entry.build_assignee_id] : []);
    const patch: any = {
      theme_text: theme.trim() || null,
      plan_comments: planComments.trim() || null,
      content_type: contentType,
      status: "plan_complete",
    };

    if (existingBuild.length === 0 && autoBuilder) {
      patch.build_assignee_ids = [autoBuilder.id];
      patch.build_assignee_id = autoBuilder.id;
      patch.build_due_date = entry?.build_due_date ?? defaultDueNotBeforeToday(week, 1);
      patch.status = "build_assigned";
    } else if (existingBuild.length > 0) {
      patch.status = "build_assigned";
    }
    let linkedTitle: string | null = null;
    if (planLinkProjectId) {
      const proj = draftProjects.find((p) => p.id === planLinkProjectId);
      patch.project_id = planLinkProjectId;
      if (proj?.title) { patch.title = proj.title; linkedTitle = proj.title; }
      patch.status = "build_in_progress";
    }
    await upsert(week, patch);
    await logActivity("plan_completed", { topic: theme.trim() || null, auto_builder: autoBuilder?.name ?? null, linked_project: linkedTitle });
    toast.success(linkedTitle ? `Plan complete — Project linked: ${linkedTitle}` : autoBuilder ? `Plan complete — Build assigned to ${autoBuilder.name}` : "Plan completed");
    setOpenPlan(false);
    setOpenBuild(true);
    close();
  };

  const submitEditBuild = async () => {
    if (buildAssignees.length === 0) return toast.error("Select at least one assignee");
    await upsert(week, {
      build_assignee_ids: buildAssignees,
      build_assignee_id: buildAssignees[0], // legacy mirror
      build_due_date: buildDue || null,
    });
    await logActivity("build_assigned", { assignees: buildAssignees.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(", "), due: buildDue });
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
    const autoOp = needsOp ? pickDefaultAssignee(operators, week) : null;
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

  // Linked project reached "Stg 10. Published" → mark the whole week (incl. Publish) complete.
  useEffect(() => {
    if (!entry?.id || !entry?.project_id) return;
    if (projectStage !== "s9_published") return;
    if (entry.status === "published") return;
    (async () => {
      await upsert(week, { status: "published", substack_published: true });
      await logActivity("publish_completed", { via: "project_stage_published" });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectStage, entry?.id, entry?.project_id, entry?.status]);

  // Revert Build → In-progress when a linked project is reversed from ready-to-publish back to in_progress/draft/review.
  useEffect(() => {
    if (!entry?.id || !entry?.project_id) return;
    if (projectStage === "s9_published") return;
    const projectActive = projectStatus && !["approved", "published"].includes(projectStatus);
    const trackerThinksDone = ["operate_assigned", "publish_complete"].includes(entry.status);
    if (projectActive && trackerThinksDone && !entry.substack_published && !entry.youtube_published) {
      (async () => {
        await upsert(week, { status: "build_in_progress" });
        await logActivity("build_reverted_from_project", { project_status: projectStatus });
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectStatus, projectStage, entry?.id, entry?.project_id, entry?.status]);


  const submitEditOp = async () => {
    if (opAssignees.length === 0) return toast.error("Select at least one assignee");
    await upsert(week, {
      operate_assignee_ids: opAssignees,
      operate_assignee_id: opAssignees[0], // legacy mirror
      operate_due_date: opDue || null,
    });
    await logActivity("operate_assigned", { assignees: opAssignees.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(", "), due: opDue });
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

  const multiUserSelect = (values: string[], onChange: (v: string[]) => void, opts: UserOpt[]) => {
    const toggle = (id: string) => {
      onChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
    };
    // Fallback: if no users have the role assigned, show all users so the tracker isn't blocked.
    const effective = opts.length > 0 ? opts : users;
    return (
      <div className="rounded-md border bg-background p-2 max-h-56 overflow-y-auto space-y-0.5">
        {opts.length === 0 && (
          <div className="mb-1 text-[11px] italic text-muted-foreground px-1">
            No users have this content role assigned — showing all users. Set roles in Users tab.
          </div>
        )}
        {effective.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">No users found.</div>
        ) : (
          effective.map((u) => (
            <label key={u.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer text-sm">
              <Checkbox checked={values.includes(u.id)} onCheckedChange={() => toggle(u.id)} />
              <span className="flex-1 truncate">{u.name}</span>
            </label>
          ))
        )}
      </div>
    );
  };


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
    assigneeIds, due, onEdit, editing, label = "Assigned",
  }: { assigneeIds?: (string | null | undefined)[] | null; due?: string | null; onEdit: () => void; editing: boolean; label?: string }) => {
    const names = (assigneeIds || [])
      .filter(Boolean)
      .map((id) => users.find((u) => u.id === id)?.name ?? "—");
    return (
      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2 flex-wrap">
        {names.length > 0 ? (
          <span>{label} to <b>{names.join(", ")}</b>{due ? ` · due ${fmtDate(due)}` : ""}</span>
        ) : (
          <span className="italic">Not yet assigned</span>
        )}
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onEdit}>
          <Pencil className="h-3 w-3 mr-1" />
          {editing ? "Close" : names.length > 0 ? "Reassign / Edit Due date" : "Assign / Set due date"}
        </Button>
      </div>
    );
  };

  const planAssigneeIds = ((entry as any)?.plan_assignee_ids as string[] | null) ?? (entry?.plan_assignee_id ? [entry.plan_assignee_id] : []);
  const buildAssigneeIds = ((entry as any)?.build_assignee_ids as string[] | null) ?? (entry?.build_assignee_id ? [entry.build_assignee_id] : []);
  const operateAssigneeIds = ((entry as any)?.operate_assignee_ids as string[] | null) ?? (entry?.operate_assignee_id ? [entry.operate_assignee_id] : []);


  return (
    <div className="border-t pt-2 space-y-1">
      {(entry as any)?.content_type && (
        <div className="px-2">
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            {contentTypeLabel((entry as any).content_type)}
          </span>
        </div>
      )}

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
            assigneeIds={planAssigneeIds}
            due={entry?.plan_due_date}
            editing={panel === "edit_plan"}
            onEdit={() => setPanel(panel === "edit_plan" ? null : "edit_plan")}
          />


          {panel === "edit_plan" && (
            <div className="mb-2 space-y-2 rounded-md border bg-muted/30 p-2">
              <label className="text-xs font-medium">Due date</label>
              <DatePicker value={planDue} onChange={setPlanDue} />
              <label className="text-xs font-medium">Planner(s)</label>
              {multiUserSelect(planAssignees, setPlanAssignees, planners)}
              <Button size="sm" className="w-full" onClick={submitEditPlan}>Save</Button>
            </div>
          )}

          {/* Plan details — always visible when planning is done */}
          {planDone && (
            <div className="mb-2 space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
              <div><b>Content type:</b> {contentTypeLabel((entry as any)?.content_type) || "—"}</div>
              <div><b>Topic:</b> {entry?.theme_text || "—"}</div>
              <div><b>Plan notes:</b> {entry?.plan_comments || "—"}</div>
              {entry?.project_id && (
                <div><b>Linked project:</b> {entry?.title || entry.project_id}</div>
              )}
            </div>
          )}

          {planDone ? (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-muted-foreground">
                Plan completed{entry?.updated_at ? ` on ${fmtDate(entry.updated_at)}` : ""}
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPanel(panel === "complete_plan" ? null : "complete_plan")}>
                Redo planning
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="w-full" onClick={() => setPanel(panel === "complete_plan" ? null : "complete_plan")}>
              Complete Planning
            </Button>
          )}


          {panel === "complete_plan" && (
            <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
              <label className="text-xs font-medium">Content type <span className="text-destructive">*</span></label>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger><SelectValue placeholder="Select content type" /></SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="text-xs font-medium">Topic <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Topic" />
              <label className="text-xs font-medium">Plan comments</label>
              <Textarea value={planComments} onChange={(e) => setPlanComments(e.target.value)} className="min-h-[60px] resize-none" />
              <label className="text-xs font-medium">
                Link a project <span className="text-muted-foreground font-normal">(concept-approved, unpublished newsletters)</span>
              </label>
              <Select value={planLinkProjectId} onValueChange={setPlanLinkProjectId}>
                <SelectTrigger><SelectValue placeholder="Select a project (optional)" /></SelectTrigger>
                <SelectContent>
                  {plannableProjects.filter((p) => p.id !== entry?.project_id).length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground">No concept-approved newsletters available</div>
                  )}
                  {plannableProjects.filter((p) => p.id !== entry?.project_id).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title} — {stageLabel(getDraftStage(p.metadata, p.status))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            assigneeIds={buildAssigneeIds}
            due={entry?.build_due_date}
            editing={panel === "edit_build"}
            onEdit={() => setPanel(panel === "edit_build" ? null : "edit_build")}
          />
          {panel === "edit_build" && (
            <div className="mb-2 space-y-2 rounded-md border bg-muted/30 p-2">
              <label className="text-xs font-medium">Due date</label>
              <DatePicker value={buildDue} onChange={setBuildDue} />
              <label className="text-xs font-medium">Builder(s)</label>
              {multiUserSelect(buildAssignees, setBuildAssignees, builders)}
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
              <div className="font-semibold text-amber-900 mb-1">
                Build progress — <span className="font-normal">{entry?.title || "(untitled project)"}</span>
              </div>
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
            assigneeIds={operateAssigneeIds}
            due={entry?.operate_due_date}
            editing={panel === "edit_op"}
            onEdit={() => setPanel(panel === "edit_op" ? null : "edit_op")}
          />
          {panel === "edit_op" && (
            <div className="mb-2 space-y-2 rounded-md border bg-muted/30 p-2">
              <label className="text-xs font-medium">Due date</label>
              <DatePicker value={opDue} onChange={setOpDue} />
              <label className="text-xs font-medium">Operator(s)</label>
              {multiUserSelect(opAssignees, setOpAssignees, operators)}
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
