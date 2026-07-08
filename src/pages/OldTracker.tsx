// Reconstruction of the June 16-22, 2026 Tracker: rolling weekly cards per
// channel with the Plan / Build / Operate (Publish) workflow. Uses the same
// tracker_entries table and WeekWorkflow component as the current Tracker.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import GlobalNav from "@/components/GlobalNav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import WeekWorkflow from "@/components/tracker/WeekWorkflow";

type Channel = "substack_satsang" | "substack_lifequest" | "youtube";
type SubChannel = "newsletter" | "long_form" | "shorts";

interface Entry {
  id: string;
  channel: Channel;
  sub_channel: SubChannel;
  week_start_date: string;
  title: string | null;
  publish_date: string | null;
  status: string;
  source: string | null;
  source_url: string | null;
  notes: string | null;
  project_id?: string | null;
}

interface UserOpt { id: string; name: string; email: string; role?: string; content_roles?: string[] }

const YEAR = 2026;

function firstMondayOfYear(year: number): Date {
  const d = new Date(Date.UTC(year, 0, 1));
  const day = d.getUTCDay();
  const offset = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

function build52Weeks(year: number): string[] {
  const start = firstMondayOfYear(year);
  const weeks: string[] = [];
  for (let i = 0; i < 52; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i * 7);
    weeks.push(d.toISOString().slice(0, 10));
  }
  return weeks;
}

function fmtWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function statusMeta(status: string) {
  if (status === "published" || status === "publish_complete")
    return { emoji: "🟢", label: "Published", cls: "bg-green-100 text-green-800 border-green-300" };
  if (status === "not_published")
    return { emoji: "🔴", label: "Not published", cls: "bg-red-100 text-red-800 border-red-300" };
  if (status === "not_applicable")
    return { emoji: "⚫", label: "N/A", cls: "bg-gray-200 text-gray-700 border-gray-300" };
  if (!status || status === "tbd")
    return { emoji: "⚪", label: "TBD", cls: "bg-slate-100 text-slate-700 border-slate-300" };
  return { emoji: "🟡", label: status.replace(/_/g, " "), cls: "bg-yellow-100 text-yellow-800 border-yellow-300" };
}

const TABS: { key: string; label: string; channel: Channel; sub: SubChannel }[] = [
  { key: "satsang",   label: "Substack — Satsang",    channel: "substack_satsang",   sub: "newsletter" },
  { key: "lifequest", label: "Substack — LifeQuest",  channel: "substack_lifequest", sub: "newsletter" },
  { key: "yt_long",   label: "YouTube — Long-form",   channel: "youtube",            sub: "long_form" },
  { key: "yt_short",  label: "YouTube — Shorts",      channel: "youtube",            sub: "shorts" },
];

const OldTracker = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [projectStatusMap, setProjectStatusMap] = useState<Record<string, string>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeKey, setActiveKey] = useState<string>("satsang");

  const weeks = useMemo(() => buildRollingWeeks(WEEKS_TO_SHOW), []);
  const planners = useMemo(() => users.filter(u => (u.content_roles ?? []).includes("planner")), [users]);
  const builders = useMemo(() => users.filter(u => (u.content_roles ?? []).includes("builder")), [users]);
  const operators = useMemo(() => users.filter(u => (u.content_roles ?? []).includes("operator")), [users]);
  const isAdmin = useMemo(() => {
    const me = users.find(u => u.id === currentUserId);
    return me?.role === "admin";
  }, [users, currentUserId]);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? null);
    const [e, u] = await Promise.all([
      supabase.from("tracker_entries")
        .select("*")
        .gte("week_start_date", `${YEAR}-01-01`)
        .lte("week_start_date", `${YEAR}-12-31`),
      supabase.from("users").select("id, name, email, role, content_roles" as any).order("name"),
    ]);
    if (e.error) toast.error("Failed to load entries");
    if (e.data) setEntries(e.data as Entry[]);
    if (u.data) setUsers(u.data as any as UserOpt[]);

    const pids = Array.from(new Set(((e.data as Entry[]) || []).map(x => x.project_id).filter(Boolean))) as string[];
    if (pids.length) {
      const { data: projs } = await supabase.from("projects").select("id, status").in("id", pids);
      const map: Record<string, string> = {};
      (projs || []).forEach((p: any) => { map[p.id] = p.status; });
      setProjectStatusMap(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const active = TABS.find(t => t.key === activeKey)!;

  const entriesByWeek = useMemo(() => {
    const map = new Map<string, Entry[]>();
    weeks.forEach(w => map.set(w, []));
    entries
      .filter(e => e.channel === active.channel && e.sub_channel === active.sub)
      .forEach(e => {
        const list = map.get(e.week_start_date);
        if (list) list.push(e);
      });
    return map;
  }, [entries, weeks, active]);

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
      setEntries(prev => prev.map(e => e.id === data.id ? (data as Entry) : e));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("tracker_entries")
        .insert({
          channel: active.channel,
          sub_channel: active.sub,
          week_start_date: week,
          status: "tbd",
          source: "manual",
          created_by: user?.id ?? null,
          ...patch,
        } as any)
        .select()
        .single();
      if (error) return toast.error(error.message);
      setEntries(prev => [...prev, data as Entry]);
    }
  };

  const resetWeek = async (week: string) => {
    const existing = (entriesByWeek.get(week) || [])[0];
    if (!existing) return;
    const { error } = await supabase.from("tracker_entries").delete().eq("id", existing.id);
    if (error) return toast.error(error.message);
    setEntries(prev => prev.filter(e => e.id !== existing.id));
  };

  const syncSubstack = async () => {
    const feedUrl = active.channel === "substack_satsang"
      ? "https://satsang.substack.com/"
      : active.channel === "substack_lifequest"
        ? "https://lifequest.substack.com/"
        : null;
    if (!feedUrl) return toast.error("No Substack feed for this channel");
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("tracker-sync-substack", {
        body: { feedUrl, channel: active.channel, year: YEAR },
      });
      if (error) throw error;
      toast.success(`Synced: ${data?.imported ?? 0} imported`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const renderTab = () => {
    const filtered = entries.filter(e => e.channel === active.channel && e.sub_channel === active.sub);
    const totalPublished = filtered.filter(e => e.status === "published" || e.status === "publish_complete").length;
    const missingWeeks = weeks.filter(w => (entriesByWeek.get(w) || []).length === 0).length;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3"><div className="text-xs text-muted-foreground">Weeks shown</div><div className="text-2xl font-bold">{WEEKS_TO_SHOW}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">Published items</div><div className="text-2xl font-bold text-green-700">{totalPublished}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">Entries total</div><div className="text-2xl font-bold">{filtered.length}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">Weeks with no content</div><div className="text-2xl font-bold text-red-700">{missingWeeks}</div></Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {weeks.map((week, idx) => {
            const items = entriesByWeek.get(week) || [];
            const primary = items[0] || null;
            const meta = statusMeta(primary?.status || "tbd");
            const weekNum = idx + 1;
            return (
              <Card key={week} className="space-y-3 w-full overflow-hidden">
                <div className="px-4 py-3 bg-muted/40 border-b">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-sm font-semibold">Week {weekNum} · {fmtWeek(week)}</div>
                    <div className="flex items-center gap-2">
                      {items.length > 1 && (
                        <Badge variant="secondary" className="text-[10px]">{items.length} entries</Badge>
                      )}
                      <Badge variant="outline" className={meta.cls}>{meta.emoji} {meta.label}</Badge>
                    </div>
                  </div>
                </div>
                <div className="px-4 pb-4 space-y-4">
                  {(items.length ? items : [null]).map((entry, i) => (
                    <div key={entry?.id || `empty-${i}`} className={i > 0 ? "pt-4 border-t" : ""}>
                      {items.length > 1 && entry && (
                        <div className="text-xs font-semibold text-muted-foreground mb-2">
                          Entry {i + 1}{entry.title ? ` · ${entry.title}` : ""}
                        </div>
                      )}
                      <WeekWorkflow
                        week={week}
                        channel={active.channel}
                        subChannel={active.sub}
                        entry={entry}
                        users={users as any}
                        planners={planners as any}
                        builders={builders as any}
                        operators={operators as any}
                        isAdmin={isAdmin}
                        projectStatus={entry?.project_id ? projectStatusMap[entry.project_id] : null}
                        upsert={upsert as any}
                        onReset={resetWeek as any}
                      />
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <div className="pl-14">
        <div className="max-w-7xl mx-auto p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold">Old Tracker (June 16 version)</h1>
              <p className="text-sm text-muted-foreground">
                Next {WEEKS_TO_SHOW} weeks with the Plan / Build / Operate (Publish) workflow. Weeks with multiple entries show every entry.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {active.channel.startsWith("substack_") && (
                <Button variant="outline" size="sm" onClick={syncSubstack} disabled={syncing}>
                  {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Sync Substack
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Refresh
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs value={activeKey} onValueChange={setActiveKey}>
              <TabsList>
                {TABS.map(t => (
                  <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
                ))}
              </TabsList>
              {TABS.map(t => (
                <TabsContent key={t.key} value={t.key} className="mt-4">
                  {activeKey === t.key && renderTab()}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
};

export default OldTracker;
