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

const CHANNEL_TABS: Array<{ key: Channel; label: string; sub: SubChannel[] }> = [
  { key: "substack_satsang", label: "Substack Newsletter (Satsang)", sub: ["newsletter"] },
  { key: "substack_lifequest", label: "LifeQuest Newsletter", sub: ["newsletter"] },
  { key: "youtube", label: "YouTube", sub: ["long_form", "shorts"] },
  { key: "daily_quote", label: "Daily Inspirations", sub: ["newsletter"] },
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
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
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

export default function PublishingStats() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel>("substack_satsang");
  const [activeSub, setActiveSub] = useState<SubChannel>("newsletter");

  const weeks = useMemo(() => weeksOfYear(YEAR), []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("tracker_entries").select("*");
    if (data) setEntries(data as Entry[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const tab = CHANNEL_TABS.find((c) => c.key === activeChannel);
    if (tab && !tab.sub.includes(activeSub)) setActiveSub(tab.sub[0]);
  }, [activeChannel]);

  const channelEntries = useMemo(
    () => entries.filter((e) => e.channel === activeChannel && e.sub_channel === activeSub),
    [entries, activeChannel, activeSub]
  );

  const publishedByWeek = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of channelEntries) {
      const isPub = !!e.substack_published || e.status === "published" || e.source === "substack";
      if (!isPub) continue;
      const w = e.week_start_date;
      const arr = map.get(w) || [];
      arr.push(e);
      map.set(w, arr);
    }
    for (const [k, arr] of map) {
      arr.sort((a, b) => (a.publish_date ?? "").localeCompare(b.publish_date ?? ""));
      map.set(k, arr);
    }
    return map;
  }, [channelEntries]);

  const ytdMaxMonth = useMemo(() => {
    const n = new Date();
    if (n.getUTCFullYear() > YEAR) return 11;
    if (n.getUTCFullYear() < YEAR) return -1;
    return n.getUTCMonth();
  }, []);

  const stats = useMemo(() => {
    const ytdWeeks = weeks.filter((w) => monthOf(w) <= ytdMaxMonth);
    let missing = 0;
    for (const w of ytdWeeks) {
      if (!(publishedByWeek.get(w) || []).length) missing++;
    }
    const published = channelEntries.filter((e) => {
      if (!e.publish_date) return false;
      const d = new Date(e.publish_date + "T00:00:00Z");
      if (d.getUTCFullYear() !== YEAR) return false;
      if (d.getUTCMonth() > ytdMaxMonth) return false;
      return !!e.substack_published || e.status === "published" || e.source === "substack";
    }).length;
    return { total: ytdWeeks.length, published, missing };
  }, [weeks, publishedByWeek, ytdMaxMonth, channelEntries]);

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
    setSyncing("gdrive");
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

  const currentTab = CHANNEL_TABS.find((c) => c.key === activeChannel)!;
  const isSubstack = activeChannel === "substack_satsang" || activeChannel === "substack_lifequest";

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <div className="pl-14">
        <div className="container mx-auto px-6 py-8 max-w-7xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BarChart3 className="h-7 w-7" /> Publishing Tracker
            </h1>
            <p className="text-muted-foreground mt-1">Weekly publishing history for {YEAR}</p>
          </div>

          {/* Channel tabs */}
          <Tabs value={activeChannel} onValueChange={(v) => setActiveChannel(v as Channel)} className="mb-4">
            <TabsList className="grid grid-cols-4 w-full h-auto">
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
            {CHANNEL_TABS.map((c) => <TabsContent key={c.key} value={c.key} />)}
          </Tabs>

          {currentTab.sub.length > 1 && (
            <Tabs value={activeSub} onValueChange={(v) => setActiveSub(v as SubChannel)} className="mb-4">
              <TabsList>
                {currentTab.sub.map((s) => (
                  <TabsTrigger key={s} value={s}>{SUB_LABEL[s]}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

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

          {/* Sync buttons */}
          {isSubstack && (
            <div className="flex gap-2 mb-6 justify-end">
              <Button onClick={syncSubstack} disabled={!!syncing} variant="outline" className="gap-2">
                {syncing === activeChannel ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync Substack
              </Button>
              <Button onClick={syncGDrive} disabled={!!syncing} variant="outline" className="gap-2">
                {syncing === "gdrive" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync Google Drive
              </Button>
            </div>
          )}

          {/* Weekly table */}
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
                              <Badge className="bg-green-100 text-green-800 border-green-200">
                                🟢 {posts.length}
                              </Badge>
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
                                      <a
                                        href={p.source_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-blue-700 hover:underline"
                                      >
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
        </div>
      </div>
    </div>
  );
}
