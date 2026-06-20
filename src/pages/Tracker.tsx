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
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

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
  const [activeChannel, setActiveChannel] = useState<Channel>("substack_satsang");
  const [activeSub, setActiveSub] = useState<SubChannel>("newsletter");
  const now = new Date();
  const defaultMonth = now.getUTCFullYear() === YEAR ? now.getUTCMonth() : 0;
  const [selectedMonth, setSelectedMonth] = useState<number>(defaultMonth);
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
    return weeks.filter((w) => monthOf(w) === selectedMonth);
  }, [weeks, selectedMonth]);

  const ytdMaxMonth = useMemo(() => {
    const n = new Date();
    if (n.getUTCFullYear() > YEAR) return 11;
    if (n.getUTCFullYear() < YEAR) return -1;
    return n.getUTCMonth();
  }, []);

  const stats = useMemo(() => {
    let published = 0, draft = 0, missing = 0, na = 0, total = 0;
    for (const w of weeks) {
      if (monthOf(w) > ytdMaxMonth) continue;
      total++;
      const list = entriesByWeek.get(w) || [];
      if (list.length === 0) { missing++; continue; }
      const top = list[0];
      if (top.status === "published") published++;
      else if (top.status === "draft") draft++;
      else if (top.status === "not_applicable") na++;
      else missing++;
    }
    return { total, published, draft, missing, na };
  }, [weeks, entriesByWeek, ytdMaxMonth]);

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
              <Button onClick={syncSubstack} disabled={!!syncing} variant="outline" className="ml-auto gap-2">
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync Substack
              </Button>
            )}
          </div>

          {/* Month buttons */}
          <div className="flex flex-wrap gap-2 mb-6">
            {MONTH_NAMES.map((m, i) => {
              const isActive = i === selectedMonth;
              return (
                <Button
                  key={m}
                  size="sm"
                  variant={isActive ? "default" : "outline"}
                  onClick={() => setSelectedMonth(i)}
                  className="min-w-[64px]"
                >
                  {m}
                </Button>
              );
            })}
          </div>

          {/* All published posts for selected month */}
          <Card className="p-4 mb-6">
            <div className="text-sm font-bold uppercase tracking-wide mb-3">
              All Posts · {new Date(YEAR, selectedMonth, 1).toLocaleString("en-US", { month: "long" })} {YEAR}
            </div>
            {monthPublishedPosts.length === 0 ? (
              <div className="text-xs text-muted-foreground">No published posts in this month yet.</div>
            ) : (
              <ul className="space-y-1.5">
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
          </Card>

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
              {visibleWeeks.map((week, idx) => {
                const list = entriesByWeek.get(week) || [];
                const entry = list[0];
                if (assigneeFilter !== "all" && entry?.assignee_id !== assigneeFilter) return null;
                if (statusFilter !== "all" && (entry?.status ?? "tbd") !== statusFilter) return null;
                const status = entry?.status ?? "tbd";
                const meta = STATUS_META[status];
                const weekNum = weeks.indexOf(week) + 1;
                return (
                  <Card key={week} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Week {weekNum} · {fmtWeek(week)}</div>
                      <Badge variant="outline" className={meta.cls}>{meta.emoji} {meta.label}</Badge>
                    </div>
                    {list.length > 1 && (
                      <div className="text-[11px] text-muted-foreground bg-blue-50 border border-blue-100 rounded px-2 py-1">
                        {list.length} posts this week
                      </div>
                    )}
                    {entry?.publish_date && (
                      <div className="text-xs text-muted-foreground">
                        📅 Published: {fmtWeek(entry.publish_date)}
                      </div>
                    )}
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
                    {list.length > 0 && (
                      <div className="space-y-1 pt-2 border-t">
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase">All posts</div>
                        {list.map((it) => (
                          <a
                            key={it.id}
                            href={it.source_url ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-xs text-blue-700 hover:underline truncate"
                            title={it.title ?? ""}
                          >
                            • {it.publish_date ? `${fmtWeek(it.publish_date)} — ` : ""}{it.title ?? "(untitled)"}
                          </a>
                        ))}
                      </div>
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
