import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import GlobalNav from "@/components/GlobalNav";
import { toast } from "sonner";
import { Loader2, RefreshCw, BarChart3 } from "lucide-react";

type Channel = "substack_satsang" | "substack_lifequest" | "youtube" | "daily_quote";
type SubChannel = "newsletter" | "long_form" | "shorts";
type TabKey =
  | "all"
  | "substack_satsang"
  | "substack_lifequest"
  | "youtube_long"
  | "youtube_shorts"
  | "daily_quote";

interface Entry {
  id: string;
  channel: Channel;
  sub_channel: SubChannel;
  week_start_date: string;
  title: string | null;
  publish_date: string | null;
  status: string;
  source: string;
  source_url: string | null;
  substack_published?: boolean | null;
}

interface ChannelDef {
  key: Exclude<TabKey, "all">;
  label: string;
  shortLabel: string;
  channel: Channel;
  sub: SubChannel;
}

const CHANNELS: ChannelDef[] = [
  { key: "substack_satsang", label: "Substack Newsletter (Satsang)", shortLabel: "Satsang NL", channel: "substack_satsang", sub: "newsletter" },
  { key: "substack_lifequest", label: "LifeQuest Newsletter", shortLabel: "LifeQuest NL", channel: "substack_lifequest", sub: "newsletter" },
  { key: "youtube_long", label: "Long form Videos", shortLabel: "Long Videos", channel: "youtube", sub: "long_form" },
  { key: "youtube_shorts", label: "Shorts / Reels Videos", shortLabel: "Shorts/Reels", channel: "youtube", sub: "shorts" },
  { key: "daily_quote", label: "Daily Inspirations", shortLabel: "Daily Insp.", channel: "daily_quote", sub: "newsletter" },
];

const TAB_ORDER: TabKey[] = ["all", ...CHANNELS.map((c) => c.key)];
const TAB_LABELS: Record<TabKey, string> = {
  all: "All Contents",
  ...Object.fromEntries(CHANNELS.map((c) => [c.key, c.label])),
} as Record<TabKey, string>;

const SUBSTACK_URLS: Partial<Record<Channel, string>> = {
  substack_satsang: "https://satsang.substack.com",
  substack_lifequest: "https://mylifequest.substack.com",
};

const YEAR = 2026;
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function mondayOf(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}
function firstMondayOfYear(year: number): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const day = jan1.getUTCDay();
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
function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
function fmtWeekRange(iso: string): string {
  const start = new Date(iso + "T00:00:00Z");
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
  const s = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const e = end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${s} – ${e}`;
}
function monthOf(iso: string): number {
  return new Date(iso + "T00:00:00Z").getUTCMonth();
}
function isPublished(e: Entry): boolean {
  return !!e.substack_published || e.status === "published" || e.source === "substack";
}

export default function PublishingStats() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const weeks = useMemo(() => weeksOfYear(YEAR), []);
  const activeChannelDef = CHANNELS.find((c) => c.key === activeTab);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("tracker_entries").select("*");
    if (data) setEntries(data as Entry[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const channelEntries = useMemo(() => {
    if (!activeChannelDef) return [];
    return entries.filter(
      (e) => e.channel === activeChannelDef.channel && e.sub_channel === activeChannelDef.sub
    );
  }, [entries, activeChannelDef]);

  const publishedByWeek = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of channelEntries) {
      if (!isPublished(e)) continue;
      const arr = map.get(e.week_start_date) || [];
      arr.push(e);
      map.set(e.week_start_date, arr);
    }
    for (const [k, arr] of map) {
      arr.sort((a, b) => (a.publish_date ?? "").localeCompare(b.publish_date ?? ""));
      map.set(k, arr);
    }
    return map;
  }, [channelEntries]);

  // For All Contents: per channel per week
  const allPublishedMatrix = useMemo(() => {
    const map = new Map<string, Map<string, Entry[]>>(); // channelKey -> week -> entries
    for (const def of CHANNELS) {
      const wm = new Map<string, Entry[]>();
      for (const e of entries) {
        if (e.channel !== def.channel || e.sub_channel !== def.sub) continue;
        if (!isPublished(e)) continue;
        const arr = wm.get(e.week_start_date) || [];
        arr.push(e);
        wm.set(e.week_start_date, arr);
      }
      map.set(def.key, wm);
    }
    return map;
  }, [entries]);

  const ytdMaxMonth = useMemo(() => {
    const n = new Date();
    if (n.getUTCFullYear() > YEAR) return 11;
    if (n.getUTCFullYear() < YEAR) return -1;
    return n.getUTCMonth();
  }, []);

  const stats = useMemo(() => {
    const ytdWeeks = weeks.filter((w) => monthOf(w) <= ytdMaxMonth);
    const published = channelEntries.filter((e) => {
      if (!e.publish_date) return false;
      const d = new Date(e.publish_date + "T00:00:00Z");
      if (d.getUTCFullYear() !== YEAR) return false;
      if (d.getUTCMonth() > ytdMaxMonth) return false;
      return isPublished(e);
    }).length;
    const missing = Math.max(0, ytdWeeks.length - published);
    return { total: ytdWeeks.length, published, missing };
  }, [weeks, ytdMaxMonth, channelEntries]);

  const syncSubstack = async () => {
    if (!activeChannelDef) return;
    const feedUrl = SUBSTACK_URLS[activeChannelDef.channel];
    if (!feedUrl) {
      const u = window.prompt("Enter Substack URL (e.g. https://yourname.substack.com)");
      if (!u) return;
      SUBSTACK_URLS[activeChannelDef.channel] = u;
    }
    setSyncing(activeChannelDef.channel);
    try {
      const { data, error } = await supabase.functions.invoke("tracker-sync-substack", {
        body: { feedUrl: SUBSTACK_URLS[activeChannelDef.channel], channel: activeChannelDef.channel, year: YEAR },
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

  const isSubstack = activeChannelDef?.channel === "substack_satsang" || activeChannelDef?.channel === "substack_lifequest";

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <div className="pl-16">
        <div className="container mx-auto px-6 py-8 max-w-7xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BarChart3 className="h-7 w-7" /> Publishing Tracker
            </h1>
            <p className="text-muted-foreground mt-1">Weekly publishing history for {YEAR}</p>
          </div>

          {/* Channel tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="mb-4">
            <TabsList className="grid grid-cols-6 w-full h-auto">
              {TAB_ORDER.map((k) => (
                <TabsTrigger
                  key={k}
                  value={k}
                  className="data-[state=active]:bg-sky-500 data-[state=active]:text-white whitespace-normal text-xs sm:text-sm"
                >
                  {TAB_LABELS[k]}
                </TabsTrigger>
              ))}
            </TabsList>
            {TAB_ORDER.map((k) => <TabsContent key={k} value={k} />)}
          </Tabs>

          {activeTab === "all" ? (
            <>
              <div className="mb-3 flex items-baseline justify-between bg-sky-500 text-white rounded-md px-4 py-2">
                <h2 className="text-xl font-bold">All Contents · Weekly Matrix</h2>
                <span className="text-xs opacity-90">{YEAR}</span>
              </div>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
              ) : (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr>
                          <th className="px-3 py-2 font-semibold w-12">#</th>
                          <th className="px-3 py-2 font-semibold w-40">Week</th>
                          {CHANNELS.map((c) => (
                            <th key={c.key} className="px-3 py-2 font-semibold text-center">
                              {c.shortLabel}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {weeks.map((w, idx) => {
                          const isFuture = monthOf(w) > ytdMaxMonth;
                          return (
                            <tr key={w} className="border-t align-top hover:bg-muted/30">
                              <td className="px-3 py-2 tabular-nums text-muted-foreground">{idx + 1}</td>
                              <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fmtWeekRange(w)}</td>
                              {CHANNELS.map((c) => {
                                const posts = allPublishedMatrix.get(c.key)?.get(w) || [];
                                return (
                                  <td key={c.key} className="px-3 py-2 align-top">
                                    {posts.length === 0 ? (
                                      <span className="text-xs text-muted-foreground italic">
                                        {isFuture ? "—" : "—"}
                                      </span>
                                    ) : (
                                      <ul className="space-y-1">
                                        {posts.map((p) => (
                                          <li key={p.id} className="text-xs leading-snug">
                                            {p.source_url ? (
                                              <a href={p.source_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                                                {p.title ?? "(untitled)"}
                                              </a>
                                            ) : (
                                              <span>{p.title ?? "(untitled)"}</span>
                                            )}
                                            {p.publish_date && (
                                              <div className="text-[10px] text-muted-foreground tabular-nums">{fmtDate(p.publish_date)}</div>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          ) : (
            <>
              {/* YTD Overview */}
              <div className="mb-3 flex items-baseline justify-between bg-sky-500 text-white rounded-md px-4 py-2">
                <h2 className="text-xl font-bold">Year-to-Date Overview</h2>
                <span className="text-xs opacity-90">Through {MONTH_NAMES[ytdMaxMonth] ?? "—"} {YEAR}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Weeks YTD</div>
                  <div className="text-2xl font-bold">{stats.total}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">🟢 Published</div>
                  <div className="text-2xl font-bold text-green-700">{stats.published}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">🔴 Missing weeks</div>
                  <div className="text-2xl font-bold text-red-700">{stats.missing}</div>
                </Card>
              </div>

              {isSubstack && (
                <div className="flex gap-2 mb-6 justify-end">
                  <Button onClick={syncSubstack} disabled={!!syncing} variant="outline" className="gap-2">
                    {syncing === activeChannelDef?.channel ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Sync Substack
                  </Button>
                </div>
              )}

              <div className="mb-3 flex items-baseline justify-between bg-sky-100 border border-sky-200 rounded-md px-4 py-2">
                <h2 className="text-lg font-bold text-sky-900">Weekly Publishing History · {YEAR}</h2>
                <span className="text-xs text-sky-900/80">{weeks.length} weeks</span>
              </div>

              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
              ) : (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr>
                          <th className="px-3 py-2 font-semibold w-16">Week #</th>
                          <th className="px-3 py-2 font-semibold w-48">Week</th>
                          <th className="px-3 py-2 font-semibold w-20">Month</th>
                          <th className="px-3 py-2 font-semibold w-24">Status</th>
                          <th className="px-3 py-2 font-semibold">Published Content</th>
                        </tr>
                      </thead>
                      <tbody>
                        {weeks.map((w, idx) => {
                          const posts = publishedByWeek.get(w) || [];
                          const isFuture = monthOf(w) > ytdMaxMonth;
                          return (
                            <tr key={w} className="border-t align-top hover:bg-muted/30">
                              <td className="px-3 py-2 tabular-nums text-muted-foreground">{idx + 1}</td>
                              <td className="px-3 py-2 tabular-nums">{fmtWeekRange(w)}</td>
                              <td className="px-3 py-2">{MONTH_NAMES[monthOf(w)]}</td>
                              <td className="px-3 py-2">
                                {posts.length > 0 ? (
                                  <Badge className="bg-green-100 text-green-800 border-green-200">🟢 {posts.length}</Badge>
                                ) : isFuture ? (
                                  <Badge variant="outline" className="text-muted-foreground">—</Badge>
                                ) : (
                                  <Badge className="bg-red-100 text-red-800 border-red-200">🔴 Missing</Badge>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {posts.length === 0 ? (
                                  <span className="text-muted-foreground italic">
                                    {isFuture ? "Upcoming" : "No content published"}
                                  </span>
                                ) : (
                                  <ul className="space-y-1">
                                    {posts.map((p) => (
                                      <li key={p.id} className="flex gap-2">
                                        <span className="text-muted-foreground tabular-nums shrink-0 text-xs pt-0.5">
                                          {p.publish_date ? fmtDate(p.publish_date) : "—"}
                                        </span>
                                        {p.source_url ? (
                                          <a href={p.source_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                                            {p.title ?? "(untitled)"}
                                          </a>
                                        ) : (
                                          <span>{p.title ?? "(untitled)"}</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
