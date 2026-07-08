// Reconstruction of the June 16, 2026 Tracker: 52 weekly cards per channel.
// Read-only view — does not modify tracker_entries or any business logic.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import GlobalNav from "@/components/GlobalNav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type Channel = "substack_satsang" | "substack_lifequest" | "youtube";
type SubChannel = "newsletter" | "long_form" | "shorts";

interface Entry {
  id: string;
  channel: string;
  sub_channel: string;
  week_start_date: string;
  title: string | null;
  publish_date: string | null;
  status: string;
  source: string | null;
  source_url: string | null;
  notes: string | null;
}

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
  return `Week of ${d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

function statusColor(status: string): string {
  switch (status) {
    case "published":
    case "publish_complete":
      return "bg-green-100 text-green-800 border-green-300";
    case "draft":
    case "build_in_progress":
    case "plan_complete":
    case "build_assigned":
    case "planning_assigned":
    case "operate_assigned":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "not_published":
      return "bg-red-100 text-red-800 border-red-300";
    case "not_applicable":
      return "bg-gray-200 text-gray-700 border-gray-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
}

function statusEmoji(status: string): string {
  if (status === "published" || status === "publish_complete") return "🟢";
  if (status === "not_published") return "🔴";
  if (status === "not_applicable") return "⚫";
  if (!status || status === "tbd") return "⚪";
  return "🟡";
}

const TABS: {
  key: string;
  label: string;
  channel: Channel;
  sub?: SubChannel;
}[] = [
  { key: "satsang", label: "Substack — Satsang", channel: "substack_satsang", sub: "newsletter" },
  { key: "lifequest", label: "Substack — LifeQuest", channel: "substack_lifequest", sub: "newsletter" },
  { key: "yt_long", label: "YouTube — Long-form", channel: "youtube", sub: "long_form" },
  { key: "yt_short", label: "YouTube — Shorts", channel: "youtube", sub: "shorts" },
];

const OldTracker = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const weeks = useMemo(() => build52Weeks(YEAR), []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tracker_entries")
      .select("id,channel,sub_channel,week_start_date,title,publish_date,status,source,source_url,notes")
      .gte("week_start_date", `${YEAR}-01-01`)
      .lte("week_start_date", `${YEAR}-12-31`)
      .order("week_start_date", { ascending: true });
    if (error) {
      toast.error("Failed to load entries");
    } else {
      setEntries((data as Entry[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const syncSubstack = async (channel: Channel, feedUrl: string) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("tracker-sync-substack", {
        body: { feedUrl, channel, year: YEAR },
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

  const renderTab = (channel: Channel, sub?: SubChannel) => {
    const filtered = entries.filter(
      (e) => e.channel === channel && (!sub || e.sub_channel === sub)
    );
    const byWeek = new Map<string, Entry[]>();
    weeks.forEach((w) => byWeek.set(w, []));
    filtered.forEach((e) => {
      const list = byWeek.get(e.week_start_date);
      if (list) list.push(e);
      else byWeek.set(e.week_start_date, [e]);
    });

    const totalPublished = filtered.filter(
      (e) => e.status === "published" || e.status === "publish_complete"
    ).length;
    const missingWeeks = weeks.filter((w) => (byWeek.get(w) || []).length === 0).length;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Total weeks</div>
            <div className="text-2xl font-bold">52</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Published items</div>
            <div className="text-2xl font-bold text-green-700">{totalPublished}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Entries total</div>
            <div className="text-2xl font-bold">{filtered.length}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Weeks with no content</div>
            <div className="text-2xl font-bold text-red-700">{missingWeeks}</div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {weeks.map((w, idx) => {
            const items = byWeek.get(w) || [];
            const hasContent = items.length > 0;
            return (
              <Card key={w} className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold">Week {idx + 1}</div>
                  <Badge variant="outline" className="text-[10px]">
                    {fmtWeek(w).replace("Week of ", "")}
                  </Badge>
                </div>
                {hasContent ? (
                  <div className="space-y-2">
                    {items.map((it) => (
                      <div key={it.id} className="border rounded-md p-2 bg-white">
                        <div className="flex items-start gap-1">
                          <span>{statusEmoji(it.status)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate" title={it.title || ""}>
                              {it.title || "(untitled)"}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className={`text-[10px] ${statusColor(it.status)}`}>
                                {it.status.replace(/_/g, " ")}
                              </Badge>
                              {it.publish_date && (
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(it.publish_date + "T00:00:00Z").toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    timeZone: "UTC",
                                  })}
                                </span>
                              )}
                              {it.source_url && (
                                <a
                                  href={it.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5"
                                >
                                  link <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic border border-dashed rounded-md p-3 text-center">
                    No content
                  </div>
                )}
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
                Read-only snapshot: 52 weekly cards for {YEAR} across Substack &amp; YouTube.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncSubstack("substack_satsang", "https://satsang.substack.com/")}
                disabled={syncing}
              >
                {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Sync Satsang
              </Button>
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
            <Tabs defaultValue="satsang">
              <TabsList>
                {TABS.map((t) => (
                  <TabsTrigger key={t.key} value={t.key}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {TABS.map((t) => (
                <TabsContent key={t.key} value={t.key} className="mt-4">
                  {renderTab(t.channel, t.sub)}
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
