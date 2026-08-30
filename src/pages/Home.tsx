import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import GlobalNav from "@/components/GlobalNav";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Home as HomeIcon,
  Sparkles,
  FileText,
  Calendar,
  BarChart3,
  Database,
  BookOpen,
  HelpCircle,
  ShieldCheck,
  Bell,
} from "lucide-react";
import logoImg from "@/assets/logo_rsm_lotus.png";
import { getDraftStage } from "@/lib/draftStages";

interface NavCard {
  label: string;
  desc: string;
  to: string;
  icon: any;
  adminOnly?: boolean;
}

const CARDS: NavCard[] = [
  { label: "Founder's Corner", desc: "Vision notes and messages from the founder.", to: "/founders-corner", icon: Sparkles },
  { label: "Create / Access Drafts", desc: "Start a new project or continue an existing draft.", to: "/dashboard", icon: FileText },
  { label: "Plan Build Publish", desc: "Weekly cards for planning, building and publishing.", to: "/tracker", icon: Calendar },
  { label: "Tracker", desc: "Publishing stats and progress across weeks.", to: "/publishing-stats", icon: BarChart3 },
  { label: "Content Store", desc: "Search past content, transcripts and clips.", to: "/content-store", icon: Database },
  { label: "Content SOPs", desc: "Standard operating procedures for content.", to: "/content-sops", icon: BookOpen },
  { label: "Srijan Help Videos / FAQs", desc: "Guides, tutorials and FAQs for the tool.", to: "/srijan-help", icon: HelpCircle },
  { label: "Team", desc: "Manage team members and roles.", to: "/admin/users", icon: ShieldCheck, adminOnly: true },
];

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [unread, setUnread] = useState(0);
  const [awaitingConcept, setAwaitingConcept] = useState(0);
  const [awaitingPeer, setAwaitingPeer] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      const { data: userRow } = await supabase
        .from("users")
        .select("name, role")
        .eq("id", user.id)
        .maybeSingle();
      const display =
        (userRow as any)?.name ||
        (user.user_metadata as any)?.name ||
        (user.email ? user.email.split("@")[0] : "there");
      setName(display);
      setIsAdmin((userRow as any)?.role === "admin");

      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null);
      setUnread(count || 0);

      const { data: projects } = await supabase
        .from("projects")
        .select("id, status, metadata")
        .limit(1000);
      let concept = 0;
      let peer = 0;
      (projects || []).forEach((p: any) => {
        const stage = getDraftStage(p.metadata, p.status);
        if (stage === "s3_awaiting_concept") concept++;
        if (stage === "s6_awaiting_peer") peer++;
      });
      setAwaitingConcept(concept);
      setAwaitingPeer(peer);
    })();
  }, [navigate]);

  const visibleCards = CARDS.filter((c) => !c.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <GlobalNav />
      <div className="pl-16">
        <div className="container mx-auto px-6 py-8 max-w-6xl">
          <div className="flex items-center gap-4 mb-8">
            <img src={logoImg} alt="Srijan" className="h-14 w-14 rounded-full" />
            <div className="flex-1">
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <HomeIcon className="h-7 w-7" /> Welcome {name}
              </h1>
              <p className="text-muted-foreground mt-1">Your Srijan home — jump into any section below.</p>
            </div>
          </div>

          <Card
            className="p-4 mb-8 cursor-pointer hover:shadow-md transition-all border-2 border-secondary/20 hover:border-secondary/40"
            onClick={() => navigate("/notifications")}
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-accent rounded-xl">
                <Bell className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">Alerts</h2>
                  {unread > 0 && <Badge variant="destructive">{unread} new</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {unread > 0
                    ? `You have ${unread} unread notification${unread === 1 ? "" : "s"}.`
                    : "You're all caught up."}
                </p>
              </div>
              <Button variant="outline" size="sm">View all</Button>
            </div>
          </Card>

          <h2 className="text-lg font-semibold mb-3">Reviews awaiting action</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <Card
              className="p-4 cursor-pointer hover:shadow-md transition-all border-2 border-secondary/20 hover:border-secondary/40"
              onClick={() => navigate("/dashboard?stage=s3_awaiting_concept")}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-accent rounded-xl shrink-0">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Awaiting Concept Review</h3>
                    {awaitingConcept > 0 && <Badge variant="destructive">{awaitingConcept}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Projects sitting at Stg 3, waiting for a concept review.
                  </p>
                </div>
              </div>
            </Card>
            <Card
              className="p-4 cursor-pointer hover:shadow-md transition-all border-2 border-secondary/20 hover:border-secondary/40"
              onClick={() => navigate("/dashboard?stage=s6_awaiting_peer")}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gradient-accent rounded-xl shrink-0">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Awaiting Peer Review</h3>
                    {awaitingPeer > 0 && <Badge variant="destructive">{awaitingPeer}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Projects sitting at Stg 6, waiting for peer review comments.
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <h2 className="text-lg font-semibold mb-3">Explore</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleCards.map((c) => (
              <Card
                key={c.to}
                className="cursor-pointer hover:shadow-md transition-all border-2 border-secondary/20 hover:border-secondary/40"
                onClick={() => navigate(c.to)}
              >
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-gradient-accent rounded-xl shrink-0">
                      <c.icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-base">{c.label}</CardTitle>
                      <CardDescription className="mt-1">{c.desc}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
