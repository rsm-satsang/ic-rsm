import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import GlobalNav from "@/components/GlobalNav";
import { toast } from "sonner";
import { Loader2, RefreshCw, Calendar as CalendarIcon, ChevronDown, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

import WeekWorkflow, { contentTypeLabel } from "@/components/tracker/WeekWorkflow";
import { getDraftStage, stageLabel } from "@/lib/draftStages";
import { formatDate } from "@/lib/datetime";


type Channel = "substack_satsang" | "substack_lifequest" | "youtube" | "workshop" | "daily_quote";
type SubChannel = "newsletter" | "long_form" | "shorts";
type Status =
  | "published" | "draft" | "not_published" | "tbd" | "not_applicable"
  | "planning_assigned" | "plan_complete" | "build_assigned" | "build_in_progress"
  | "operate_assigned" | "publish_complete";

interface Entry {
  id: string;
  channel: Channel;
  sub_channel: SubChannel;
  week_start_date: string;
  title: string | null;
  publish_date: string | null;
  theme_id: string | null;
  assignee_id: string | null;
  status: Status;
  due_date: string | null;
  notes: string | null;
  source: string;
  source_url: string | null;
  plan_assignee_id?: string | null;
  plan_due_date?: string | null;
  theme_text?: string | null;
  plan_comments?: string | null;
  build_assignee_id?: string | null;
  build_due_date?: string | null;
  draft_title?: string | null;
  project_id?: string | null;
  operate_assignee_id?: string | null;
  operate_due_date?: string | null;
  substack_published?: boolean | null;
  youtube_published?: boolean | null;
}

interface UserOpt { id: string; name: string; email: string; content_roles?: string[] }
interface ThemeOpt { id: string; name: string; }

const STATUS_META: Record<Status, { label: string; emoji: string; cls: string }> = {
  published: { label: "Published", emoji: "🟢", cls: "bg-green-100 text-green-800 border-green-200" },
  draft: { label: "Draft / In Progress", emoji: "🟡", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  not_published: { label: "Not Published", emoji: "🔴", cls: "bg-red-100 text-red-800 border-red-200" },
  tbd: { label: "TBD", emoji: "⚪", cls: "bg-gray-100 text-gray-700 border-gray-200" },
  not_applicable: { label: "Not Applicable", emoji: "⚫", cls: "bg-gray-200 text-gray-600 border-gray-300" },
  planning_assigned: { label: "Awaiting Planning", emoji: "📝", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  plan_complete: { label: "Plan Complete", emoji: "✅", cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  build_assigned: { label: "Awaiting Build", emoji: "🛠️", cls: "bg-purple-100 text-purple-800 border-purple-200" },
  build_in_progress: { label: "Build In Progress", emoji: "🚧", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  operate_assigned: { label: "Awaiting Publish", emoji: "📣", cls: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  publish_complete: { label: "Publish Complete", emoji: "🎉", cls: "bg-green-100 text-green-800 border-green-200" },
};


function mondayOf(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function firstMondayOfYear(year: number): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const day = jan1.getUTCDay(); // 0 Sun .. 6 Sat
  const offset = day === 1 ? 0 : (day === 0 ? 1 : 8 - day);
  jan1.setUTCDate(jan1.getUTCDate() + offset);
  return jan1;
}

function weeksOfYear(year: number): string[] {
  const out: string[] = [];
  const start = firstMondayOfYear(year);
  const end = mondayOf(new Date(Date.UTC(year, 11, 31)));
  const d = new Date(start);
  while (d.getTime() <= end.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

function fmtWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function monthOf(iso: string): number {
  return new Date(iso + "T00:00:00Z").getUTCMonth();
}

type TabKey = "substack_satsang" | "substack_lifequest" | "youtube_long" | "youtube_shorts" | "daily_quote";
const CHANNEL_TABS: Array<{ key: TabKey; label: string; channel: Channel; sub: SubChannel }> = [
  { key: "substack_satsang", label: "Substack Newsletter (Satsang)", channel: "substack_satsang", sub: "newsletter" },
  { key: "substack_lifequest", label: "LifeQuest Newsletter", channel: "substack_lifequest", sub: "newsletter" },
  { key: "youtube_long", label: "Long form Videos", channel: "youtube", sub: "long_form" },
  { key: "youtube_shorts", label: "Shorts / Reels Videos", channel: "youtube", sub: "shorts" },
  { key: "daily_quote", label: "Daily Inspirations", channel: "daily_quote", sub: "newsletter" },
];

const SUBSTACK_URLS: Partial<Record<Channel, string>> = {
  substack_satsang: "https://satsang.substack.com",
  substack_lifequest: "https://mylifequest.substack.com",
};

const YEAR = 2026;
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const GOAL_LABELS: Record<string, string> = {
  substack_newsletter: "Substack Newsletter",
  wordpress_blog: "WordPress Blog",
  note: "Note",
  book_article: "Book Article",
  story_children: "Story (Children)",
  story_adults: "Story (Adults)",
  proofreading: "Proofreading",
  translation: "Translation",
  other: "Other",
};
const goalLabel = (goal?: string) =>
  !goal ? "-" : GOAL_LABELS[goal] || goal.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function monthBounds(year: number, month: number): { min: string; max: string } {
  const min = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const max = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  return { min, max };
}

export default function Tracker() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [themes, setThemes] = useState<ThemeOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Channel | null>(null);
  const [activeTabKey, setActiveTabKey] = useState<TabKey>("substack_satsang");
  const activeTab = CHANNEL_TABS.find((c) => c.key === activeTabKey) ?? CHANNEL_TABS[0];
  const activeChannel = activeTab.channel;
  const activeSub = activeTab.sub;
  const now = new Date();
  const defaultMonth = now.getUTCFullYear() === YEAR ? now.getUTCMonth() : 0;
  const [selectedMonth, setSelectedMonth] = useState<number>(defaultMonth);
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [projectStatusMap, setProjectStatusMap] = useState<Record<string, string>>({});
  const [projectInfoMap, setProjectInfoMap] = useState<Record<string, any>>({});
  const [rangeFrom, setRangeFrom] = useState<number>(defaultMonth);
  const [rangeTo, setRangeTo] = useState<number>(11);
  // Map of `${channel}|${sub_channel}|${week_start_date}|${action}` → latest created_at date (ISO date)
  const [activityDoneMap, setActivityDoneMap] = useState<Record<string, string>>({});


  const weeks = useMemo(() => weeksOfYear(YEAR), []);

  const planners = useMemo(() => users.filter((u) => (u.content_roles ?? []).includes("planner")), [users]);
  const builders = useMemo(() => users.filter((u) => (u.content_roles ?? []).includes("builder")), [users]);
  const operators = useMemo(() => users.filter((u) => (u.content_roles ?? []).includes("operator")), [users]);

  const isAdmin = useMemo(() => {
    const me = users.find((u) => u.id === currentUserId);
    return (me as any)?.role === "admin";
  }, [users, currentUserId]);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? null);
    const [e, u, t, a] = await Promise.all([
      supabase.from("tracker_entries").select("*"),
      supabase.from("users").select("id, name, email, role, content_roles" as any).order("name"),
      supabase.from("themes").select("id, name").order("name"),
      supabase.from("tracker_activity" as any).select("channel, sub_channel, week_start_date, action, created_at"),
    ]);
    if (e.data) setEntries(e.data as Entry[]);
    if (u.data) setUsers(u.data as any as UserOpt[]);
    if (t.data) setThemes(t.data as ThemeOpt[]);
    if (a.data) {
      const map: Record<string, string> = {};
      (a.data as any[]).forEach((r) => {
        const key = `${r.channel}|${r.sub_channel}|${r.week_start_date}|${r.action}`;
        const d = String(r.created_at).slice(0, 10);
        if (!map[key] || d > map[key]) map[key] = d;
      });
      setActivityDoneMap(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Deep-link from Workspace: ?project=<id> → switch to that entry's channel/sub/month and scroll to its week
  const focusedWeekRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !entries.length) return;
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("project");
    if (!pid) return;
    const match = entries.find((e) => e.project_id === pid);
    if (!match) return;
    const tk = CHANNEL_TABS.find((c) => c.channel === match.channel && c.sub === match.sub_channel)?.key;
    if (tk) setActiveTabKey(tk);
    setSelectedMonth(monthOf(match.week_start_date));
    focusedWeekRef.current = match.week_start_date;
    // Clear param after handling so it doesn't re-trigger
    const url = new URL(window.location.href);
    url.searchParams.delete("project");
    window.history.replaceState({}, "", url.toString());
  }, [loading, entries]);

  useEffect(() => {
    if (!focusedWeekRef.current) return;
    const w = focusedWeekRef.current;
    // Wait a tick for re-render
    const t = setTimeout(() => {
      const el = document.getElementById(`week-card-${w}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-sky-400");
        setTimeout(() => el.classList.remove("ring-2", "ring-sky-400"), 2500);
        focusedWeekRef.current = null;
      }
    }, 250);
    return () => clearTimeout(t);
  }, [activeChannel, activeSub, selectedMonth, entries]);

  // Fetch linked project statuses; unlink entries whose project was deleted
  useEffect(() => {
    const linked = entries.filter((e) => e.project_id);
    const ids = Array.from(new Set(linked.map((e) => e.project_id as string)));
    if (!ids.length) { setProjectStatusMap({}); setProjectInfoMap({}); return; }
    (async () => {
      const { data } = await supabase.from("projects").select("id,status,title,owner_id,metadata").in("id", ids);
      const found = new Set((data as any[] | null)?.map((p) => p.id) ?? []);
      const map: Record<string, string> = {};
      const info: Record<string, any> = {};
      (data as any[] | null)?.forEach((p) => { map[p.id] = p.status; info[p.id] = p; });
      setProjectStatusMap(map);
      setProjectInfoMap(info);


      const orphanEntries = linked.filter((e) => !found.has(e.project_id as string));
      if (orphanEntries.length) {
        for (const e of orphanEntries) {
          await supabase
            .from("tracker_entries")
            .update({ project_id: null, title: null, status: "build_assigned" })
            .eq("id", (e as any).id);
        }
        await load();
      }
    })();
  }, [entries]);




  // (sub-channel is now derived from the tab; no reset effect needed)

  const channelEntries = useMemo(() => {
    return entries.filter(
      (e) => e.channel === activeChannel && e.sub_channel === activeSub
    );
  }, [entries, activeChannel, activeSub]);

  const entriesByWeek = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of channelEntries) {
      const arr = m.get(e.week_start_date) || [];
      arr.push(e);
      m.set(e.week_start_date, arr);
    }
    // Sort: most recently updated first, so list[0] reflects latest state.
    for (const [k, arr] of m) {
      arr.sort((a: any, b: any) =>
        (b.updated_at ?? b.created_at ?? "").localeCompare(a.updated_at ?? a.created_at ?? "")
      );
      m.set(k, arr);
    }
    return m;
  }, [channelEntries]);


  const visibleWeeks = useMemo(() => {
    return weeks.filter((w) => monthOf(w) === selectedMonth);
  }, [weeks, selectedMonth]);

  // Auto-assign planner + default due date to any visible week missing an entry
  const autoCreateLock = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (loading || !planners.length) return;
    if (activeChannel === "workshop" || activeChannel === "daily_quote") return;
    const missing = visibleWeeks.filter((w) => {
      const key = `${activeChannel}|${activeSub}|${w}`;
      return !(entriesByWeek.get(w) || []).length && !autoCreateLock.current.has(key);
    });
    if (!missing.length) return;
    missing.forEach((w) => autoCreateLock.current.add(`${activeChannel}|${activeSub}|${w}`));
    const todayIso = new Date().toISOString().slice(0, 10);
    const defaultDue = (w: string) => {
      const d = new Date(w + "T00:00:00Z");
      d.setUTCMonth(d.getUTCMonth() - 2);
      const iso = d.toISOString().slice(0, 10);
      return iso < todayIso ? todayIso : iso;
    };
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      // Default planner is always Sangeeta ji when present in the planner list
      const defaultPlanner =
        planners.find((p: any) => (p.name || "").toLowerCase().includes("sangeeta")) || null;
      const rows = missing.map((w) => {
        const n = parseInt(w.replace(/-/g, ""), 10);
        const planner = defaultPlanner || planners[n % planners.length];
        return {
          channel: activeChannel,
          sub_channel: activeSub,
          week_start_date: w,
          status: "planning_assigned" as Status,
          source: "auto",
          created_by: user?.id ?? null,
          plan_assignee_id: planner.id,
          plan_assignee_ids: [planner.id],
          plan_due_date: defaultDue(w),
        };
      });

      // Insert planning slots one-by-one so a duplicate on the (channel,sub,week,source_url)
      // slot index doesn't abort the whole batch.
      const inserted: any[] = [];
      for (const row of rows) {
        const { data: r, error: insErr } = await supabase
          .from("tracker_entries")
          .insert(row as any)
          .select()
          .maybeSingle();
        if (!insErr && r) inserted.push(r);
      }
      const data = inserted;
      const error = null as any;
      if (!error && data) setEntries((prev) => {
        const ids = new Set(prev.map((p: any) => p.id));
        const fresh = (data as Entry[]).filter((d: any) => !ids.has(d.id));
        return [...prev, ...fresh];
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleWeeks, planners, loading, activeChannel, activeSub, entriesByWeek]);



  const ytdMaxMonth = useMemo(() => {
    const n = new Date();
    if (n.getUTCFullYear() > YEAR) return 11;
    if (n.getUTCFullYear() < YEAR) return -1;
    return n.getUTCMonth();
  }, []);

  const stats = useMemo(() => {
    let total = 0;
    for (const w of weeks) {
      if (monthOf(w) > ytdMaxMonth) continue;
      total++;
    }
    // Count all published newsletters YTD (not just one per week)
    const published = channelEntries.filter((e) => {
      if (!e.publish_date) return false;
      const d = new Date(e.publish_date + "T00:00:00Z");
      if (d.getUTCFullYear() !== YEAR) return false;
      if (d.getUTCMonth() > ytdMaxMonth) return false;
      return !!e.substack_published || e.status === "published" || e.source === "substack";
    }).length;
    const missing = Math.max(0, total - published);
    return { total, published, missing };
  }, [weeks, entriesByWeek, ytdMaxMonth, channelEntries]);

  // Phase-bucket metrics (FULL YEAR scope)
  const phaseStats = useMemo(() => {
    const ytdWeeks = weeks;

    let planInProgress = 0, planComplete = 0;
    let buildYet = 0, buildAssigned = 0, buildInProgress = 0, buildComplete = 0;
    let opInProgress = 0, opComplete = 0;
    for (const w of ytdWeeks) {
      const top = (entriesByWeek.get(w) || [])[0];
      const st = top?.status ?? "tbd";
      const projSt = top?.project_id ? projectStatusMap[top.project_id] : undefined;
      const planDone = ["plan_complete","build_assigned","build_in_progress","operate_assigned","publish_complete","published"].includes(st);
      const projReady = projSt === "approved" || projSt === "published";
      const buildDone = ["operate_assigned","publish_complete","published"].includes(st) || (planDone && projReady);
      const opDone = ["publish_complete","published"].includes(st);
      if (planDone) planComplete++; else planInProgress++;
      if (buildDone) buildComplete++;
      else if (planDone) {
        if (top?.project_id || st === "build_in_progress") buildInProgress++;
        else buildAssigned++;
      } else buildYet++;
      if (opDone) opComplete++;
      else if (buildDone) opInProgress++;
    }
    return { planInProgress, planComplete, buildYet, buildAssigned, buildInProgress, buildComplete, opInProgress, opComplete };
  }, [weeks, entriesByWeek, ytdMaxMonth, projectStatusMap]);

  // Monthly phase metrics
  const monthPhaseStats = useMemo(() => {
    let planInProgress = 0, planComplete = 0;
    let buildYet = 0, buildAssigned = 0, buildInProgress = 0, buildComplete = 0;
    let opInProgress = 0, opComplete = 0;
    for (const w of weeks.filter((w) => monthOf(w) === selectedMonth)) {
      const top = (entriesByWeek.get(w) || [])[0];
      const st = top?.status ?? "tbd";
      const projSt = top?.project_id ? projectStatusMap[top.project_id] : undefined;
      const planDone = ["plan_complete","build_assigned","build_in_progress","operate_assigned","publish_complete","published"].includes(st);
      const projReady = projSt === "approved" || projSt === "published";
      const buildDone = ["operate_assigned","publish_complete","published"].includes(st) || (planDone && projReady);
      const opDone = ["publish_complete","published"].includes(st);
      if (planDone) planComplete++; else planInProgress++;
      if (buildDone) buildComplete++;
      else if (planDone) {
        if (top?.project_id || st === "build_in_progress") buildInProgress++;
        else buildAssigned++;
      } else buildYet++;
      if (opDone) opComplete++;
      else if (buildDone) opInProgress++;
    }
    return { planInProgress, planComplete, buildYet, buildAssigned, buildInProgress, buildComplete, opInProgress, opComplete };
  }, [weeks, entriesByWeek, selectedMonth, projectStatusMap]);

  // ── Plan / Build / Operate week counts across a month range ──
  const rangeWeeks = useMemo(() => {
    const lo = Math.min(rangeFrom, rangeTo);
    const hi = Math.max(rangeFrom, rangeTo);
    return weeks.filter((w) => monthOf(w) >= lo && monthOf(w) <= hi);
  }, [weeks, rangeFrom, rangeTo]);

  const rangeStats = useMemo(() => {
    let planningAwaited = 0, buildInProgress = 0, readyOrPublished = 0;
    for (const w of rangeWeeks) {
      const top = (entriesByWeek.get(w) || [])[0];
      const st = top?.status ?? "tbd";
      const projSt = top?.project_id ? projectStatusMap[top.project_id] : undefined;
      const planDone = ["plan_complete","build_assigned","build_in_progress","operate_assigned","publish_complete","published"].includes(st);
      const projReady = projSt === "approved" || projSt === "published";
      const buildDone = ["operate_assigned","publish_complete","published"].includes(st) || (planDone && projReady);
      if (!planDone) planningAwaited++;
      else if (!buildDone) buildInProgress++;
      else readyOrPublished++;
    }
    return { total: rangeWeeks.length, planningAwaited, buildInProgress, readyOrPublished };
  }, [rangeWeeks, entriesByWeek, projectStatusMap]);


  const monthPublishedPosts = useMemo(() => {
    const list = channelEntries.filter((e) => {
      if (!e.publish_date) return false;
      const d = new Date(e.publish_date + "T00:00:00Z");
      return d.getUTCFullYear() === YEAR && d.getUTCMonth() === selectedMonth;
    });
    return list.sort((a, b) => (a.publish_date! < b.publish_date! ? 1 : -1));
  }, [channelEntries, selectedMonth]);


  const gaps = useMemo(() => weeks.filter((w) => !(entriesByWeek.get(w) || []).length), [weeks, entriesByWeek]);

  const upsert = async (week: string, patch: Partial<Entry>) => {
    const existing = (entriesByWeek.get(week) || [])[0];
    if (existing) {
      const { data, error } = await supabase
        .from("tracker_entries")
        .update(patch as any)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return toast.error(error.message);
      setEntries((prev) => prev.map((e) => (e.id === data.id ? (data as Entry) : e)));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tracker_entries")
        .insert({
          channel: activeChannel,
          sub_channel: activeSub,
          week_start_date: week,
          status: "tbd",
          source: "manual",
          created_by: user?.id ?? null,
          ...patch,
        } as any)
        .select()
        .single();
      if (error) return toast.error(error.message);
      setEntries((prev) => [...prev, data as Entry]);
    }
  };

  const resetWeek = async (week: string) => {
    const existing = (entriesByWeek.get(week) || [])[0];
    if (!existing) return;
    const { error } = await supabase.from("tracker_entries").delete().eq("id", existing.id);
    if (error) return toast.error(error.message);
    setEntries((prev) => prev.filter((e) => e.id !== existing.id));
  };

  const syncSubstack = async () => {
    const feedUrl = SUBSTACK_URLS[activeChannel];
    if (!feedUrl) {
      const u = window.prompt("Enter Substack URL (e.g. https://yourname.substack.com)");
      if (!u) return;
      SUBSTACK_URLS[activeChannel] = u;
    }
    setSyncing(activeChannel);
    try {
      const { data, error } = await supabase.functions.invoke("tracker-sync-substack", {
        body: { feedUrl: SUBSTACK_URLS[activeChannel], channel: activeChannel, year: YEAR },
      });
      if (error) throw error;
      toast.success(`Imported ${data?.imported ?? 0} posts`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  const syncGDrive = async () => {
    setSyncing("gdrive" as any);
    try {
      const { data, error } = await supabase.functions.invoke("tracker-sync-gdrive", {
        body: { channel: activeChannel, year: YEAR },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Imported ${data?.imported ?? 0} posts from Google Drive`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Google Drive sync failed");
    } finally {
      setSyncing(null);
    }
  };

  // ── Week status helper (shared by calendar + cards) ────────────────────────
  const weekMeta = (week: string) => {
    const entry = (entriesByWeek.get(week) || [])[0];
    const status = (entry?.status ?? "tbd") as Status;
    const meta = STATUS_META[status];
    const projSt = entry?.project_id ? projectStatusMap[entry.project_id] : undefined;
    const planDone = ["plan_complete","build_assigned","build_in_progress","operate_assigned","publish_complete","published"].includes(status);
    const projReady = projSt === "approved" || projSt === "published";
    const buildDone = ["operate_assigned","publish_complete","published"].includes(status) || (planDone && projReady);
    const opDone = ["publish_complete","published"].includes(status);
    let headerBg = "bg-gray-300";
    if (opDone) headerBg = "bg-green-200";
    else if (buildDone) headerBg = "bg-green-50";
    else if (planDone && (status === "build_in_progress" || entry?.project_id)) headerBg = "bg-yellow-50";
    return { entry, status, meta, planDone, buildDone, opDone, headerBg };
  };

  // Calendar rows (Mon-start) covering the selected month
  const calendarRows = useMemo(() => {
    const first = new Date(Date.UTC(YEAR, selectedMonth, 1));
    const last = new Date(Date.UTC(YEAR, selectedMonth + 1, 0));
    const cur = mondayOf(first);
    const rows: { weekIso: string; days: Date[] }[] = [];
    while (cur.getTime() <= last.getTime()) {
      const days: Date[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(cur);
        d.setUTCDate(d.getUTCDate() + i);
        days.push(d);
      }
      rows.push({ weekIso: cur.toISOString().slice(0, 10), days });
      cur.setUTCDate(cur.getUTCDate() + 7);
    }
    return rows;
  }, [selectedMonth]);

  // Publish markers by ISO date for the active channel
  const publishByDate = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of channelEntries) {
      if (!e.publish_date) continue;
      const arr = m.get(e.publish_date) || [];
      arr.push(e);
      m.set(e.publish_date, arr);
    }
    return m;
  }, [channelEntries]);

  const nameById = useMemo(() => {
    const m: Record<string, string> = {};
    users.forEach((u) => { m[u.id] = u.name; });
    return m;
  }, [users]);

  // Rich per-week info used by the calendar rows
  const phaseAssigneeNames = (entry: Entry | undefined, key: "plan" | "build" | "operate") => {
    if (!entry) return [] as string[];
    const ids = (((entry as any)[`${key}_assignee_ids`] as string[] | null) ??
      ((entry as any)[`${key}_assignee_id`] ? [(entry as any)[`${key}_assignee_id`]] : [])) as string[];
    return Array.from(new Set(ids.map((id) => nameById[id]).filter(Boolean)));
  };

  const weekInfo = (week: string) => {
    const { entry, status, meta, planDone, buildDone, opDone } = weekMeta(week);
    const proj = entry?.project_id ? projectInfoMap[entry.project_id] : null;
    const author = proj?.owner_id ? nameById[proj.owner_id] ?? null : null;
    const stageValue = proj ? getDraftStage(proj.metadata, proj.status) : null;
    const stage = stageValue ? stageLabel(stageValue) : null;
    const reviewerIds = (proj?.metadata?.peer_reviewer_ids as string[] | undefined) ?? [];
    const reviewers = reviewerIds.map((id) => nameById[id]).filter(Boolean);

    const doneOn = (action: string) =>
      entry ? activityDoneMap[`${entry.channel}|${entry.sub_channel}|${week}|${action}`] ?? null : null;

    const phases = {
      plan: { names: phaseAssigneeNames(entry, "plan"), due: entry?.plan_due_date ?? null, doneOn: doneOn("plan_completed") },
      build: { names: phaseAssigneeNames(entry, "build"), due: (entry as any)?.build_due_date ?? null, doneOn: doneOn("build_complete_auto") },
      operate: { names: phaseAssigneeNames(entry, "operate"), due: (entry as any)?.operate_due_date ?? null, doneOn: doneOn("publish_completed") },
    };

    const dues = [
      { label: "Plan", date: phases.plan.due, done: planDone || !!phases.plan.doneOn },
      { label: "Build", date: phases.build.due, done: buildDone || !!phases.build.doneOn },
      { label: "Publish", date: phases.operate.due, done: opDone || !!phases.operate.doneOn },
    ].filter((d) => !!d.date) as { label: string; date: string; done: boolean }[];


    const todayMonday = mondayOf(new Date()).toISOString().slice(0, 10);
    const weeksAway = Math.round(
      (new Date(week + "T00:00:00Z").getTime() - new Date(todayMonday + "T00:00:00Z").getTime()) /
        (7 * 86400000)
    );

    const todayISO = new Date().toISOString().slice(0, 10);
    let overdueDays = 0;
    let overdueLabel: string | null = null;
    if (!opDone) {
      for (const d of dues) {
        if (d.done) continue;
        if (d.date < todayISO) {

          const days = Math.floor(
            (new Date(todayISO + "T00:00:00Z").getTime() - new Date(d.date + "T00:00:00Z").getTime()) / 86400000
          );
          if (days > overdueDays) { overdueDays = days; overdueLabel = d.label; }
        }
      }
    }

    return {
      contentType: contentTypeLabel((entry as any)?.content_type),
      projectId: entry?.project_id ?? null,
      projectTitle: proj?.title ?? entry?.title ?? null,
      author,
      stage,
      stageValue,
      reviewers,
      status,
      statusLabel: meta?.label ?? status,
      planDone,
      buildDone,
      opDone,
      phases,
      dues,
      weeksAway,
      overdueDays,
      overdueLabel,
    };
  };

  // ── Stuck view: weeks whose due dates have passed, grouped by reason ──────
  const stuckReason = (overdueLabel: string | null, stageValue: string | null): string | null => {
    if (overdueLabel === "Plan") return "Stuck at Plan";
    if (overdueLabel === "Build") {
      if (stageValue === "s3_awaiting_concept") return "Stuck at Build - Awaiting Concept Review";
      if (stageValue === "s6_awaiting_peer") return "Stuck at Build - Awaiting Peer Review";
      if (stageValue === "s7_awaiting_final") return "Stuck at Build - Final Go Ahead";
      return "Stuck at Build";
    }
    return null; // ignore Publish overdue
  };

  const stuckWeeks = useMemo(() => {
    const out: { week: string; weekNum: number; reason: string; days: number; title: string | null }[] = [];
    for (const w of rangeWeeks) {
      const i = weekInfo(w);
      if (i.overdueDays > 0) {
        const reason = stuckReason(i.overdueLabel, i.stageValue);
        if (!reason) continue;
        out.push({
          week: w,
          weekNum: weeks.indexOf(w) + 1,
          reason,
          days: i.overdueDays,
          title: i.projectTitle,
        });
      }
    }
    return out.sort((a, b) => b.days - a.days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeWeeks, entriesByWeek, projectStatusMap, projectInfoMap, activityDoneMap, nameById]);

  const stuckByReason = useMemo(() => {
    const m: Record<string, number> = {};
    stuckWeeks.forEach((s) => { m[s.reason] = (m[s.reason] || 0) + 1; });
    return m;
  }, [stuckWeeks]);

  const stuckPlan = stuckByReason["Stuck at Plan"] || 0;
  const stuckBuildConcept = stuckByReason["Stuck at Build - Awaiting Concept Review"] || 0;
  const stuckBuildPeer = stuckByReason["Stuck at Build - Awaiting Peer Review"] || 0;
  const stuckBuildFinal = stuckByReason["Stuck at Build - Final Go Ahead"] || 0;
  const stuckBuildTotal = Object.entries(stuckByReason)
    .filter(([reason]) => reason.startsWith("Stuck at Build"))
    .reduce((sum, [, count]) => sum + count, 0);




  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  const [panelRequest, setPanelRequest] = useState<{ week: string; key: string; nonce: number } | null>(null);
  const [reviewerDialog, setReviewerDialog] = useState<{ projectId: string; title: string } | null>(null);
  const [reviewerSel, setReviewerSel] = useState<string[]>([]);
  const [savingReviewers, setSavingReviewers] = useState(false);
  const navigate = useNavigate();

  const openPanel = (week: string, key: string) => {
    setSelectedWeek(week);
    setPanelRequest({ week, key, nonce: Date.now() });
  };

  // Send a reminder for a specific phase of a week (assignees of that phase + admins).
  const notifyPhase = async (week: string, phase: "plan" | "build" | "operate") => {
    const entry = (entriesByWeek.get(week) || [])[0];
    const weekNum = weeks.indexOf(week) + 1;
    const contentId = `NS-SBS-DFT-${week.replace(/-/g, "")}`;
    const ids: string[] =
      (((entry as any)?.[`${phase}_assignee_ids`] as string[] | null) ??
        ((entry as any)?.[`${phase}_assignee_id`] ? [(entry as any)[`${phase}_assignee_id`]] : [])) as string[];
    if (!ids.length) return toast.error(`No one is assigned to the ${phase} phase yet`);
    const recipients = users.filter((u) => ids.includes(u.id)).map((u) => ({ name: u.name, email: u.email, id: u.id }));
    const description =
      phase === "plan" ? "Plan the weekly content theme and brief."
      : phase === "build" ? "Build the draft / produce the content."
      : "Publish on Substack/YouTube.";
    const due = (entry as any)?.[`${phase}_due_date`] ?? null;
    try {
      const { error } = await supabase.functions.invoke("notify-week-assignees", {
        body: {
          contentId,
          weekLabel: `Week ${weekNum} · ${fmtWeek(week)}`,
          title: entry?.title || entry?.theme_text || `Week of ${week}`,
          status: STATUS_META[(entry?.status ?? "tbd") as Status]?.label ?? "",
          recipients,
          planContext: phase === "build" ? {
            topic: entry?.theme_text || null,
            plan_comments: entry?.plan_comments || null,
            linked_project_title: entry?.title || null,
            linked_project_id: entry?.project_id || null,
          } : null,
          plan: phase === "plan" ? { assignee_ids: ids, due, description } : {},
          build: phase === "build" ? { assignee_ids: ids, due, description } : {},
          operate: phase === "operate" ? { assignee_ids: ids, due, description } : {},
        },
      });
      if (error) throw error;
      toast.success(`Reminder sent to ${phase} assignees (+ admins)`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send reminder");
    }
  };

  const notifyReviewers = async (projectId: string) => {
    const proj = projectInfoMap[projectId];
    const ids: string[] = (proj?.metadata?.peer_reviewer_ids as string[] | undefined) ?? [];
    const reviewerEmails = users.filter((u) => ids.includes(u.id)).map((u) => u.email).filter(Boolean);
    const adminEmails = users.filter((u) => (u as any).role === "admin").map((u) => u.email).filter(Boolean);
    const emails = Array.from(new Set([...adminEmails, ...reviewerEmails]));
    if (emails.length === 0) return toast.error("No reviewers or admins to notify");
    try {
      const { error } = await supabase.functions.invoke("notify-reviewers", {
        body: { projectId, versionId: null, requesterId: currentUserId, recipientEmails: emails },
      });
      if (error) throw error;
      toast.success(`Notified ${emails.length} reviewer(s)`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to notify reviewers");
    }
  };

  const openReviewerDialog = (projectId: string, title: string) => {
    const proj = projectInfoMap[projectId];
    setReviewerSel(((proj?.metadata?.peer_reviewer_ids as string[] | undefined) ?? []).slice());
    setReviewerDialog({ projectId, title });
  };

  const saveReviewers = async () => {
    if (!reviewerDialog) return;
    setSavingReviewers(true);
    try {
      const proj = projectInfoMap[reviewerDialog.projectId];
      const metadata = { ...(proj?.metadata ?? {}), peer_reviewer_ids: reviewerSel };
      const { error } = await supabase.from("projects").update({ metadata }).eq("id", reviewerDialog.projectId);
      if (error) throw error;
      setProjectInfoMap((m) => ({ ...m, [reviewerDialog.projectId]: { ...(m[reviewerDialog.projectId] ?? {}), metadata } }));
      toast.success("Reviewers updated");
      setReviewerDialog(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update reviewers");
    } finally {
      setSavingReviewers(false);
    }
  };


  useEffect(() => {
    const monthWeeks = weeks.filter((w) => monthOf(w) === selectedMonth);
    const todayMonday = mondayOf(new Date()).toISOString().slice(0, 10);
    setSelectedWeek(monthWeeks.includes(todayMonday) ? todayMonday : (monthWeeks[0] ?? null));
  }, [selectedMonth, activeTabKey, weeks]);

  // ── Weekly card renderer (used by calendar side panel + monthly list) ──────
  const renderWeekCard = (week: string, applyFilters = true) => {
    const { entry, status, meta, planDone, buildDone, opDone, headerBg } = weekMeta(week);
    if (applyFilters) {
      if (assigneeFilter !== "all" && entry?.assignee_id !== assigneeFilter) return null;
      if (statusFilter !== "all" && status !== statusFilter) return null;
    }
    const weekNum = weeks.indexOf(week) + 1;
    const contentId = `NS-SBS-DFT-${week.replace(/-/g, "")}`;

    const notifyAssignees = async () => {
      try {
        let activePhase: "plan" | "build" | "operate" | null = null;
        if (!planDone) activePhase = "plan";
        else if (!buildDone) activePhase = "build";
        else if (!opDone) activePhase = "operate";

        if (!activePhase) {
          return toast.error("All phases are complete — nothing to remind");
        }

        const planIds: string[] = ((entry as any)?.plan_assignee_ids as string[] | null) ?? (entry?.plan_assignee_id ? [entry.plan_assignee_id] : []);
        const buildIds: string[] = ((entry as any)?.build_assignee_ids as string[] | null) ?? (entry?.build_assignee_id ? [entry.build_assignee_id] : []);
        const opIds: string[] = ((entry as any)?.operate_assignee_ids as string[] | null) ?? (entry?.operate_assignee_id ? [entry.operate_assignee_id] : []);

        const activeAssigneeIds =
          activePhase === "plan" ? planIds
          : activePhase === "build" ? buildIds
          : opIds;

        if (activeAssigneeIds.length === 0) {
          return toast.error(`No assignee on the current ${activePhase} phase`);
        }

        const recipients = users
          .filter((u) => activeAssigneeIds.includes(u.id))
          .map((u) => ({ name: u.name, email: u.email, id: u.id }));

        const phaseDescription =
          activePhase === "plan" ? "Plan the weekly content theme and brief."
          : activePhase === "build" ? "Build the draft / produce the content."
          : "Publish on Substack/YouTube.";

        let linkedProjectTitle: string | null = null;
        if (entry?.project_id) {
          linkedProjectTitle = entry?.title || null;
        }

        const planContext = activePhase === "build" ? {
          topic: entry?.theme_text || null,
          plan_comments: entry?.plan_comments || null,
          linked_project_title: linkedProjectTitle,
          linked_project_id: entry?.project_id || null,
        } : null;

        const { error } = await supabase.functions.invoke("notify-week-assignees", {
          body: {
            contentId,
            weekLabel: `Week ${weekNum} · ${fmtWeek(week)}`,
            title: entry?.title || entry?.theme_text || `Week of ${week}`,
            status: meta?.label ?? status,
            recipients,
            planContext,
            plan: activePhase === "plan" ? { assignee_ids: planIds, due: entry?.plan_due_date, description: phaseDescription } : {},
            build: activePhase === "build" ? { assignee_ids: buildIds, due: entry?.build_due_date, description: phaseDescription } : {},
            operate: activePhase === "operate" ? { assignee_ids: opIds, due: entry?.operate_due_date, description: phaseDescription } : {},
          },
        });
        if (error) throw error;
        toast.success(`Reminder sent for ${activePhase} phase (+ admins)`);
      } catch (e: any) {
        toast.error(e.message ?? "Failed to send reminders");
      }
    };

    return (
      <Card key={week} id={`week-card-${week}`} className="space-y-3 w-full overflow-hidden transition-all">
        <div className={`px-4 py-3 ${headerBg} border-b`}>
          <div className="text-[11px] font-mono text-muted-foreground">{contentId}</div>
          <div className="flex items-center justify-between flex-wrap gap-2 mt-1">
            <div className="text-sm font-semibold">Week {weekNum} · {fmtWeek(week)}</div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={meta.cls}>{meta.emoji} {meta.label}</Badge>
              {isAdmin && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={notifyAssignees}>
                  Notify assignees
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="px-4 pb-4">
          <WeekWorkflow
            week={week}
            channel={activeChannel}
            subChannel={activeSub}
            entry={entry ?? null}
            users={users}
            planners={planners}
            builders={builders}
            operators={operators}
            isAdmin={isAdmin}
            projectStatus={entry?.project_id ? projectStatusMap[entry.project_id] : null}
            projectStage={
              entry?.project_id && projectInfoMap[entry.project_id]
                ? getDraftStage(projectInfoMap[entry.project_id].metadata, projectInfoMap[entry.project_id].status)
                : null
            }
            upsert={upsert as any}
            onReset={resetWeek as any}
            panelRequest={panelRequest && panelRequest.week === week ? { key: panelRequest.key, nonce: panelRequest.nonce } : null}
          />
        </div>
      </Card>
    );
  };

  return (

    <div className="min-h-screen bg-background">
      <GlobalNav />
      <div className="pl-16">
        <div className="container mx-auto px-6 py-8 max-w-7xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <CalendarIcon className="h-7 w-7" /> Content Production using Plan-Build-Operate
              </h1>
              <p className="text-muted-foreground mt-1">Weekly publishing calendar for {YEAR}</p>
            </div>
          </div>

          {/* Channel tabs */}
          <Tabs value={activeTabKey} onValueChange={(v) => setActiveTabKey(v as TabKey)} className="mb-4">
            <TabsList className="grid grid-cols-5 w-full h-auto">
              {CHANNEL_TABS.map((c) => (
                <TabsTrigger
                  key={c.key}
                  value={c.key}
                  className="data-[state=active]:bg-sky-500 data-[state=active]:text-white whitespace-normal text-xs sm:text-sm"
                >
                  {c.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {CHANNEL_TABS.map((c) => (
              <TabsContent key={c.key} value={c.key} />
            ))}
          </Tabs>


          {/* YTD Section */}
          <div className="mb-3 flex items-baseline justify-between bg-sky-500 text-white rounded-md px-4 py-2">
            <h2 className="text-xl font-bold">Year-to-Date Overview</h2>
            <span className="text-xs opacity-90">Through {MONTH_NAMES[ytdMaxMonth] ?? "—"} {YEAR}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Weeks YTD</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">🟢 Published</div>
              <div className="text-2xl font-bold text-green-700">{stats.published}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">🔴 Missing</div>
              <div className="text-2xl font-bold text-red-700">{stats.missing}</div>
            </Card>
          </div>
          {/* Plan/Build/Operate week status for a month range + stuck weeks */}
          <div className="mb-6">
            {/* Plan / Build / Operate week status for a chosen month range */}
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-semibold">Plan · Build · Operate status by week</h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">From</span>
                    <Select value={String(rangeFrom)} onValueChange={(v) => setRangeFrom(Number(v))}>
                      <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">To</span>
                    <Select value={String(rangeTo)} onValueChange={(v) => setRangeTo(Number(v))}>
                      <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-md border bg-blue-50 px-3 py-2">
                    <span className="text-sm">📝 Weeks with Planning Awaited</span>
                    <b className="text-lg text-blue-800">{rangeStats.planningAwaited}</b>
                  </div>
                  <div className="flex items-center justify-between rounded-md border bg-amber-50 px-3 py-2">
                    <span className="text-sm">🛠️ Weeks with Planning Complete, Build In Progress</span>
                    <b className="text-lg text-amber-800">{rangeStats.buildInProgress}</b>
                  </div>
                  <div className="flex items-center justify-between rounded-md border bg-green-50 px-3 py-2">
                    <span className="text-sm">🎉 Weeks Ready to Publish / Published</span>
                    <b className="text-lg text-green-800">{rangeStats.readyOrPublished}</b>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {rangeStats.total} week(s) · {MONTH_NAMES[Math.min(rangeFrom, rangeTo)]}–{MONTH_NAMES[Math.max(rangeFrom, rangeTo)]} {YEAR} · {activeTab.label}
                  </div>
                </div>
              </Card>

              {/* Stuck view */}
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3">🚨 Stuck weeks (due date passed)</h3>
                {stuckWeeks.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Nothing is overdue in this period.</div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-red-100 border border-red-200 text-red-800 px-3 py-1 text-xs font-semibold">
                        Stuck at Plan: {stuckPlan}
                      </span>
                      <span className="rounded-full bg-red-100 border border-red-200 text-red-800 px-3 py-1 text-xs font-semibold">
                        Stuck at Build: {stuckBuildTotal}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Build breakdown:</span>
                      <span className="rounded-full bg-red-50 border border-red-100 text-red-700 px-2.5 py-0.5 text-[11px] font-medium">
                        Awaiting Concept Review: {stuckBuildConcept}
                      </span>
                      <span className="rounded-full bg-red-50 border border-red-100 text-red-700 px-2.5 py-0.5 text-[11px] font-medium">
                        Awaiting Peer Review: {stuckBuildPeer}
                      </span>
                      <span className="rounded-full bg-red-50 border border-red-100 text-red-700 px-2.5 py-0.5 text-[11px] font-medium">
                        Final Go Ahead: {stuckBuildFinal}
                      </span>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>


          {/* Filters + Sync */}
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <div className="text-sm font-medium text-muted-foreground">Filter:</div>
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Assignee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assignees</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(STATUS_META) as Status[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_META[s].emoji} {STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(activeChannel === "substack_satsang" || activeChannel === "substack_lifequest") && (
              <div className="ml-auto flex gap-2">
                <Button onClick={syncSubstack} disabled={!!syncing} variant="outline" className="gap-2">
                  {syncing === activeChannel ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Sync Substack
                </Button>
              </div>
            )}
          </div>

          {/* Section divider */}
          <div className="border-t my-6" />

          {/* ── Calendar month view + selected week panel ─────────────────── */}
          <div className="mb-3 flex items-center justify-between flex-wrap gap-3 bg-sky-100 border border-sky-200 rounded-md px-4 py-2">
            <h2 className="text-xl font-bold text-sky-900">Calendar · {MONTH_NAMES[selectedMonth]} {YEAR}</h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="outline" className="h-8 bg-white"
                onClick={() => setSelectedMonth((m) => (m + 11) % 12)}
              >‹ Prev</Button>
              <Button
                size="sm" variant="outline" className="h-8 bg-white"
                onClick={() => setSelectedMonth((m) => (m + 1) % 12)}
              >Next ›</Button>
            </div>
          </div>

          <div className="mb-6 flex flex-col lg:flex-row gap-4 items-start">
            {/* Calendar */}
            <Card className="p-4 bg-gradient-to-b from-sky-50/70 to-background border-2 border-sky-300 shadow-md flex-1 min-w-0 w-full">
              <div className="grid grid-cols-7 gap-2 mb-2">
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
                  <div key={d} className="text-xs font-bold text-center text-sky-900/80 uppercase tracking-wider py-1">{d}</div>
                ))}
              </div>
              <div className="space-y-3">
                {calendarRows.map((row) => {
                  const inYear = weeks.includes(row.weekIso);
                  const { entry, meta } = weekMeta(row.weekIso);
                  const weekNum = weeks.indexOf(row.weekIso) + 1;
                  const isSelected = selectedWeek === row.weekIso;

                  const detail = entry?.theme_text || entry?.draft_title || null;
                  const info = weekInfo(row.weekIso);
                  const stuck = inYear && info.overdueDays > 0;
                  const isOpen = !!expandedPhases[row.weekIso];
                  const toggle = () => {
                    if (!inYear) return;
                    setSelectedWeek(row.weekIso);
                    setExpandedPhases((s) => ({ ...s, [row.weekIso]: !s[row.weekIso] }));
                  };

                  const CalLink = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onClick(); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onClick(); } }}
                      className="text-sky-700 underline underline-offset-2 hover:text-sky-900 cursor-pointer"
                    >
                      {children}
                    </span>
                  );

                  const phaseLine = (
                    key: "plan" | "build" | "operate",
                    emoji: string,
                    label: string,
                    done: boolean,
                    body: React.ReactNode,
                    actions?: React.ReactNode,
                  ) => {
                    const p = info.phases[key];
                    const suffix = done
                      ? p.doneOn ? `Done on ${formatDate(p.doneOn)}` : "Done"
                      : p.due ? `Due by ${formatDate(p.due)}` : "No due date";
                    return (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs rounded-md bg-sky-50/70 border border-sky-100 px-2 py-1">
                        <span className="font-semibold">{emoji} {label}</span>
                        <span className={done ? "text-green-700 font-medium" : "text-muted-foreground"}>({suffix})</span>
                        <span className="text-foreground">{body}</span>
                        {actions}
                      </div>
                    );
                  };

                  return (
                    <div
                      key={row.weekIso}
                      className={`rounded-2xl border-2 bg-white transition-all shadow-sm hover:shadow-lg ${
                        isSelected ? "border-sky-500 ring-2 ring-sky-200" : "border-sky-200 hover:border-sky-400"
                      } ${inYear ? "" : "opacity-40 pointer-events-none"}`}
                    >
                      {/* Header line — week number + summary, whole week collapses into it */}
                      <div
                        role="button"
                        tabIndex={inYear ? 0 : -1}
                        onClick={toggle}
                        onKeyDown={(e) => { if (e.key === "Enter") toggle(); }}
                        className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-sky-100 bg-sky-50/60 rounded-t-2xl cursor-pointer"
                      >
                        <ChevronDown className={`h-4 w-4 text-sky-700 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                        <span className="text-sm font-bold text-sky-900">Week {weekNum > 0 ? weekNum : "—"}</span>
                        {(info.projectTitle || detail) && (
                          <span className="text-xs font-semibold text-sky-900 truncate max-w-[45%]">
                            · 📌 {info.projectTitle || detail}
                          </span>
                        )}
                        {info.contentType && (
                          <span className="rounded-full bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {info.contentType}
                          </span>
                        )}
                        {inYear && (
                          <>
                            {/* During Build, the week status is strictly the linked project's draft stage */}
                            {info.planDone && !info.opDone && info.stage ? (
                              <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-200 text-[10px] py-0">
                                🛠️ {info.stage}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className={`${meta.cls} text-[10px] py-0`}>{meta.emoji} {meta.label}</Badge>
                            )}
                            {stuck ? (
                              <span className="rounded-full bg-red-600 text-white px-2 py-0.5 text-[10px] font-semibold">
                                Stuck at {info.overdueLabel ?? "phase"} · {info.overdueDays} day{info.overdueDays > 1 ? "s" : ""} overdue
                              </span>
                            ) : (
                              <span className="rounded-full bg-green-600 text-white px-2 py-0.5 text-[10px] font-semibold">On Track</span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Week summary — Plan / Build / Publish rows (top, below the week header) */}
                      {inYear && isOpen && (
                        <div className="px-3 pt-3 space-y-2">
                          {/* Linked project */}
                          <div className="text-xs flex items-center gap-1.5 flex-wrap">
                            {(info.projectTitle || detail) ? (
                              <span className="font-semibold truncate max-w-[60%]">📌 {info.projectTitle || detail}</span>
                            ) : (
                              <span className="text-muted-foreground">No linked project</span>
                            )}
                            {info.projectId && (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); navigate(`/workspace/${info.projectId}`); }}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); navigate(`/workspace/${info.projectId}`); } }}
                                className="inline-flex items-center gap-0.5 text-sky-700 underline underline-offset-2 hover:text-sky-900 cursor-pointer"
                              >
                                Open <ExternalLink className="h-3 w-3" />
                              </span>
                            )}
                          </div>

                          {phaseLine("plan", "📝", "Plan", info.planDone,
                            <span>{info.phases.plan.names.length ? info.phases.plan.names.join(", ") : "—"}</span>,
                            <span className="flex items-center gap-2">
                              <CalLink onClick={() => notifyPhase(row.weekIso, "plan")}>Notify</CalLink>
                              <CalLink onClick={() => openPanel(row.weekIso, info.planDone ? "see_plan" : "complete_plan")}>
                                {info.planDone ? "See plan" : "Complete Planning"}
                              </CalLink>
                            </span>
                          )}
                          {info.planDone && phaseLine("build", "🛠️", "Build", info.buildDone,
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span>
                                {info.author ? `✍️ ${info.author}` : (info.phases.build.names.length ? info.phases.build.names.join(", ") : "—")}
                                {info.stage && <span className="text-muted-foreground"> · {info.stage}</span>}
                              </span>
                              <CalLink onClick={() => notifyPhase(row.weekIso, "build")}>Notify</CalLink>
                              <span className="basis-full text-muted-foreground flex items-center gap-2 flex-wrap">
                                <span><b className="font-semibold text-foreground">Reviewers:</b> {info.reviewers.length > 0 ? info.reviewers.join(", ") : "—"}</span>
                                {info.projectId && (
                                  <>
                                    <CalLink onClick={() => notifyReviewers(info.projectId!)}>Notify reviewers</CalLink>
                                    <CalLink onClick={() => openReviewerDialog(info.projectId!, info.projectTitle || "Project")}>
                                      Change reviewers
                                    </CalLink>
                                  </>
                                )}
                              </span>
                            </span>
                          )}
                          {info.planDone && info.buildDone && phaseLine("operate", "📮", "Publish", info.opDone,
                            <span>{info.phases.operate.names.length ? info.phases.operate.names.join(", ") : "—"}</span>,
                            <span className="flex items-center gap-2">
                              <CalLink onClick={() => notifyPhase(row.weekIso, "operate")}>Notify</CalLink>
                              <CalLink onClick={() => openPanel(row.weekIso, "complete_op")}>
                                Mark as published / Moved to Substack
                              </CalLink>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Dates of the week */}
                      <div className="grid grid-cols-7 gap-2 p-3">
                        {row.days.map((d) => {
                          const iso = d.toISOString().slice(0, 10);
                          const other = d.getUTCMonth() !== selectedMonth;
                          const pubs = publishByDate.get(iso) || [];
                          const isToday = iso === new Date().toISOString().slice(0, 10);
                          return (
                            <div
                              key={iso}
                              className={`h-16 rounded-xl border px-2 py-1 ${
                                other ? "bg-muted/30 text-muted-foreground/50 border-sky-100" : "bg-white text-foreground border-sky-200"
                              } ${isToday ? "border-sky-500 ring-2 ring-sky-300 bg-sky-50" : ""}`}
                            >
                              <div className="text-lg font-bold tabular-nums leading-tight">{d.getUTCDate()}</div>
                              {pubs.length > 0 && (
                                <div className="text-[10px] text-green-700 font-medium truncate">● {pubs.length > 1 ? `${pubs.length} posts` : "post"}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                    </div>
                  );

                })}
              </div>
              <div className="text-xs text-muted-foreground mt-3">Click a week header to expand or collapse its summary. The full workflow for the selected week appears on the right.</div>
            </Card>

            {/* Right-side panel: full weekly workflow for the selected week */}
            <div className="w-full lg:w-[420px] lg:shrink-0 lg:sticky lg:top-4">
              {selectedWeek && weeks.includes(selectedWeek) ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-sky-900 bg-sky-100 border border-sky-200 rounded-md px-3 py-1.5">
                    Selected week workflow
                  </div>
                  {renderWeekCard(selectedWeek, false)}
                </div>
              ) : (
                <Card className="p-6 text-sm text-muted-foreground text-center border-dashed">
                  Select a week in the calendar to manage its Plan / Build / Publish workflow here.
                </Card>
              )}
            </div>
          </div>




          {/* Monthly section header with inline Plan/Track by Month + month dropdown */}
          <div className="mb-3 flex items-center justify-between flex-wrap gap-3 bg-sky-100 border border-sky-200 rounded-md px-4 py-2">
            <div className="flex items-center gap-4 flex-wrap">
              <h2 className="text-xl font-bold text-sky-900">Monthly View</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-sky-900">Plan/Track by Month:</span>
                <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                  <SelectTrigger className="w-32 h-8 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((m, i) => (
                      <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <span className="text-xs text-sky-900/80">{MONTH_NAMES[selectedMonth]} {YEAR}</span>
          </div>

          {(() => {
            const monthWeeks = visibleWeeks;
            const missingWeeksList: string[] = [];
            for (const w of monthWeeks) {
              const list = entriesByWeek.get(w) || [];
              const top = list[0];
              const isPub = !!top?.substack_published || top?.status === "published";
              if (!isPub) missingWeeksList.push(w);
            }
            // Count actual published newsletters (not weeks) in this month
            const mPublished = channelEntries.filter((e) => {
              if (!e.publish_date) return false;
              const d = new Date(e.publish_date + "T00:00:00Z");
              if (d.getUTCFullYear() !== YEAR || d.getUTCMonth() !== selectedMonth) return false;
              return !!e.substack_published || e.status === "published" || e.source === "substack";
            }).length;
            const mMissing = Math.max(0, monthWeeks.length - mPublished);
            const missingWeeks = missingWeeksList;
            const monthName = new Date(YEAR, selectedMonth, 1).toLocaleString("en-US", { month: "long" });
            return (
              <Card className="p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Weeks in {monthName}</div>
                    <div className="text-xl font-bold">{monthWeeks.length}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">🟢 Published posts</div>
                    <div className="text-xl font-bold text-green-700">{mPublished}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">🔴 Missing weeks</div>
                    <div className="text-xl font-bold text-red-700">{mMissing}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground font-semibold mb-1">📝 Plan</div>
                    <div className="text-sm flex justify-between"><span>Assigned</span><b>{monthPhaseStats.planInProgress}</b></div>
                    <div className="text-sm flex justify-between"><span>Complete</span><b className="text-green-700">{monthPhaseStats.planComplete}</b></div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground font-semibold mb-1">🛠️ Build</div>
                    <div className="text-sm flex justify-between"><span>Awaiting Plan</span><b>{monthPhaseStats.buildYet}</b></div>
                    <div className="text-sm flex justify-between"><span>Assigned</span><b>{monthPhaseStats.buildAssigned}</b></div>
                    <div className="text-sm flex justify-between"><span>In-progress</span><b className="text-amber-700">{monthPhaseStats.buildInProgress}</b></div>
                    <div className="text-sm flex justify-between"><span>Complete</span><b className="text-green-700">{monthPhaseStats.buildComplete}</b></div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground font-semibold mb-1">📣 Operate</div>
                    <div className="text-sm flex justify-between"><span>Awaiting Build</span><b>{Math.max(0, monthWeeks.length - monthPhaseStats.buildComplete - monthPhaseStats.opComplete)}</b></div>
                    <div className="text-sm flex justify-between"><span>Assigned</span><b className="text-amber-700">{monthPhaseStats.opInProgress}</b></div>
                    <div className="text-sm flex justify-between"><span>Complete</span><b className="text-green-700">{monthPhaseStats.opComplete}</b></div>
                  </div>
                </div>

                <div className="text-sm font-bold mb-2 text-green-700">
                  Published Posts · {monthName} {YEAR}
                </div>
                {monthPublishedPosts.length === 0 ? (
                  <div className="text-xs text-muted-foreground mb-4">No published posts in this month yet.</div>
                ) : (
                  <ul className="space-y-1.5 mb-4">
                    {monthPublishedPosts.map((p) => (
                      <li key={p.id} className="text-sm flex gap-2">
                        <span className="text-muted-foreground tabular-nums shrink-0">
                          {fmtWeek(p.publish_date!)}
                        </span>
                        <a
                          href={p.source_url ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-700 hover:underline truncate"
                        >
                          {p.title ?? "(untitled)"}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}

                {missingWeeks.length > 0 && (
                  <div className="border-t pt-3">
                    <div className="text-sm font-semibold text-red-800 mb-2">
                      Missing weeks in {monthName} ({missingWeeks.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {missingWeeks.map((w) => (
                        <Badge key={w} variant="outline" className="bg-white border-red-200 text-red-700">
                          {fmtWeek(w)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })()}


          {/* Weekly cards section header */}
          <div className="mb-3 flex items-baseline justify-between bg-sky-100 border border-sky-200 rounded-md px-4 py-2">
            <h2 className="text-lg font-bold text-sky-900">Weekly Cards · {MONTH_NAMES[selectedMonth]} {YEAR}</h2>
            <span className="text-xs text-sky-900/80">{visibleWeeks.length} week(s)</span>
          </div>

          {/* Weekly cards */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
          ) : (
            <div className="flex flex-col gap-4">
              {visibleWeeks.map((week) => renderWeekCard(week))}
            </div>
          )}

          {/* Change reviewers dialog */}
          <Dialog open={!!reviewerDialog} onOpenChange={(o) => { if (!o) setReviewerDialog(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Reviewers · {reviewerDialog?.title}</DialogTitle>
              </DialogHeader>
              <div className="max-h-[50vh] overflow-y-auto space-y-1">
                {users
                  .filter((u) => (u as any).role === "admin" || ((u as any).content_roles ?? []).includes("builder"))
                  .map((u) => (
                    <label key={u.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                      <Checkbox
                        checked={reviewerSel.includes(u.id)}
                        onCheckedChange={() =>
                          setReviewerSel((s) => (s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id]))
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{u.name || u.email}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {(u as any).role === "admin" ? "Admin" : "Builder"}
                      </Badge>
                    </label>
                  ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReviewerDialog(null)} disabled={savingReviewers}>Cancel</Button>
                <Button onClick={saveReviewers} disabled={savingReviewers}>
                  {savingReviewers ? "Saving…" : "Save reviewers"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>

      </div>
    </div>
  );
}
