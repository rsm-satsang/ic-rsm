import { useEffect, useMemo, useState } from "react";
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
import GlobalNav from "@/components/GlobalNav";
import { toast } from "sonner";
import { Loader2, RefreshCw, Calendar as CalendarIcon } from "lucide-react";

type Channel = "substack_satsang" | "substack_lifequest" | "youtube";
type SubChannel = "newsletter" | "long_form" | "shorts";
type Status = "published" | "draft" | "not_published" | "tbd" | "not_applicable";

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
}

interface UserOpt { id: string; name: string; email: string; }
interface ThemeOpt { id: string; name: string; }

const STATUS_META: Record<Status, { label: string; emoji: string; cls: string }> = {
  published: { label: "Published", emoji: "🟢", cls: "bg-green-100 text-green-800 border-green-200" },
  draft: { label: "Draft / In Progress", emoji: "🟡", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  not_published: { label: "Not Published", emoji: "🔴", cls: "bg-red-100 text-red-800 border-red-200" },
  tbd: { label: "TBD", emoji: "⚪", cls: "bg-gray-100 text-gray-700 border-gray-200" },
  not_applicable: { label: "Not Applicable", emoji: "⚫", cls: "bg-gray-200 text-gray-600 border-gray-300" },
};

function mondayOf(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function weeksOfYear(year: number): string[] {
  const out: string[] = [];
  const start = mondayOf(new Date(Date.UTC(year, 0, 4))); // ISO week 1 contains Jan 4
  for (let i = 0; i < 53; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i * 7);
    if (d.getUTCFullYear() > year && d.getUTCMonth() > 0) break;
    if (d.getUTCFullYear() === year || (d.getUTCFullYear() === year - 1 && d.getUTCMonth() === 11)) {
      out.push(d.toISOString().slice(0, 10));
    } else if (d.getUTCFullYear() === year + 1 && d.getUTCMonth() === 0 && d.getUTCDate() <= 3) {
      // include last week if it spills into Jan
    }
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

const CHANNEL_TABS: Array<{ key: Channel; label: string; sub: SubChannel[] }> = [
  { key: "substack_satsang", label: "Substack Newsletter (Satsang)", sub: ["newsletter"] },
  { key: "substack_lifequest", label: "LifeQuest Newsletter", sub: ["newsletter"] },
  { key: "youtube", label: "YouTube", sub: ["long_form", "shorts"] },
];

const SUB_LABEL: Record<SubChannel, string> = {
  newsletter: "Newsletter",
  long_form: "Long-form",
  shorts: "Shorts",
};

const SUBSTACK_URLS: Partial<Record<Channel, string>> = {
  substack_satsang: "https://satsang.substack.com",
  substack_lifequest: "https://mylifequest.substack.com",
};

const YEAR = 2026;

export default function Tracker() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [themes, setThemes] = useState<ThemeOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Channel | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel>("substack_satsang");
  const [activeSub, setActiveSub] = useState<SubChannel>("newsletter");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const weeks = useMemo(() => weeksOfYear(YEAR), []);

  const load = async () => {
    setLoading(true);
    const [e, u, t] = await Promise.all([
      supabase.from("tracker_entries").select("*"),
      supabase.from("users").select("id, name, email").order("name"),
      supabase.from("themes").select("id, name").order("name"),
    ]);
    if (e.data) setEntries(e.data as Entry[]);
    if (u.data) setUsers(u.data as UserOpt[]);
    if (t.data) setThemes(t.data as ThemeOpt[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const tab = CHANNEL_TABS.find((c) => c.key === activeChannel);
    if (tab && !tab.sub.includes(activeSub)) setActiveSub(tab.sub[0]);
  }, [activeChannel]);

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
    return m;
  }, [channelEntries]);

  const visibleWeeks = useMemo(() => {
    return weeks.filter((w) => {
      if (monthFilter !== "all" && monthOf(w) !== Number(monthFilter)) return false;
      return true;
    });
  }, [weeks, monthFilter]);

  const stats = useMemo(() => {
    let published = 0, draft = 0, missing = 0, na = 0;
    for (const w of weeks) {
      const list = entriesByWeek.get(w) || [];
      if (list.length === 0) { missing++; continue; }
      const top = list[0];
      if (top.status === "published") published++;
      else if (top.status === "draft") draft++;
      else if (top.status === "not_applicable") na++;
      else missing++;
    }
    return { total: weeks.length, published, draft, missing, na };
  }, [weeks, entriesByWeek]);

  const gaps = useMemo(() => weeks.filter((w) => !(entriesByWeek.get(w) || []).length), [weeks, entriesByWeek]);

  const upsert = async (week: string, patch: Partial<Entry>) => {
    const existing = (entriesByWeek.get(week) || [])[0];
    if (existing) {
      const { data, error } = await supabase
        .from("tracker_entries")
        .update(patch)
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
        })
        .select()
        .single();
      if (error) return toast.error(error.message);
      setEntries((prev) => [...prev, data as Entry]);
    }
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

  const currentTab = CHANNEL_TABS.find((c) => c.key === activeChannel)!;

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <div className="pl-14">
        <div className="container mx-auto px-6 py-8 max-w-7xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <CalendarIcon className="h-7 w-7" /> Content Production Tracker
              </h1>
              <p className="text-muted-foreground mt-1">Weekly publishing calendar for {YEAR}</p>
            </div>
          </div>

          {/* Channel tabs */}
          <Tabs value={activeChannel} onValueChange={(v) => setActiveChannel(v as Channel)} className="mb-4">
            <TabsList className="grid grid-cols-3 w-full">
              {CHANNEL_TABS.map((c) => (
                <TabsTrigger key={c.key} value={c.key}>{c.label}</TabsTrigger>
              ))}
            </TabsList>
            {CHANNEL_TABS.map((c) => (
              <TabsContent key={c.key} value={c.key} />
            ))}
          </Tabs>

          {/* Sub-channel (for YouTube) */}
          {currentTab.sub.length > 1 && (
            <Tabs value={activeSub} onValueChange={(v) => setActiveSub(v as SubChannel)} className="mb-4">
              <TabsList>
                {currentTab.sub.map((s) => (
                  <TabsTrigger key={s} value={s}>{SUB_LABEL[s]}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {/* Analytics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Total Planned</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">🟢 Published</div>
              <div className="text-2xl font-bold text-green-700">{stats.published}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">🟡 Draft</div>
              <div className="text-2xl font-bold text-yellow-700">{stats.draft}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">🔴 Missing</div>
              <div className="text-2xl font-bold text-red-700">{stats.missing}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">⚫ N/A</div>
              <div className="text-2xl font-bold text-gray-600">{stats.na}</div>
            </Card>
          </div>

          {/* Filters + Sync */}
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Month" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {Array.from({ length: 12 }).map((_, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {new Date(YEAR, i, 1).toLocaleString("en-US", { month: "long" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <Button onClick={syncSubstack} disabled={!!syncing} variant="outline" className="ml-auto gap-2">
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync Substack
              </Button>
            )}
          </div>

          {/* Gap panel */}
          {gaps.length > 0 && (
            <Card className="p-4 mb-6 border-red-200 bg-red-50/50">
              <div className="text-sm font-semibold text-red-800 mb-2">Missing weeks ({gaps.length})</div>
              <div className="flex flex-wrap gap-1">
                {gaps.slice(0, 30).map((w) => (
                  <Badge key={w} variant="outline" className="bg-white border-red-200 text-red-700">
                    {fmtWeek(w)}
                  </Badge>
                ))}
                {gaps.length > 30 && <span className="text-xs text-red-700">+ {gaps.length - 30} more</span>}
              </div>
            </Card>
          )}

          {/* Weekly cards */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleWeeks.map((week) => {
                const list = entriesByWeek.get(week) || [];
                const entry = list[0];
                if (assigneeFilter !== "all" && entry?.assignee_id !== assigneeFilter) return null;
                if (statusFilter !== "all" && (entry?.status ?? "tbd") !== statusFilter) return null;
                const status = entry?.status ?? "tbd";
                const meta = STATUS_META[status];
                return (
                  <Card key={week} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Week of {fmtWeek(week)}</div>
                      <Badge variant="outline" className={meta.cls}>{meta.emoji} {meta.label}</Badge>
                    </div>
                    <Input
                      placeholder="Content title"
                      defaultValue={entry?.title ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (entry?.title ?? "")) upsert(week, { title: v || null });
                      }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={status} onValueChange={(v) => upsert(week, { status: v as Status })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_META) as Status[]).map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_META[s].emoji} {STATUS_META[s].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={entry?.assignee_id ?? "none"}
                        onValueChange={(v) => upsert(week, { assignee_id: v === "none" ? null : v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={entry?.theme_id ?? "none"}
                        onValueChange={(v) => upsert(week, { theme_id: v === "none" ? null : v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Theme" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No theme</SelectItem>
                          {themes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        type="date"
                        defaultValue={entry?.due_date ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== (entry?.due_date ?? "")) upsert(week, { due_date: v || null });
                        }}
                      />
                    </div>
                    <Textarea
                      placeholder="Notes"
                      defaultValue={entry?.notes ?? ""}
                      className="min-h-[60px] resize-none"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (entry?.notes ?? "")) upsert(week, { notes: v || null });
                      }}
                    />
                    {entry?.source_url && (
                      <a href={entry.source_url} target="_blank" rel="noreferrer"
                         className="text-xs text-blue-600 underline truncate block">
                        {entry.source_url}
                      </a>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
