// Daily reminder emails (07:30 EST via pg_cron):
//  - Projects in Stg 6 (Awaiting Peer Review): assigned reviewers + all Builders + all Admins
//  - Projects in Stg 3 (Awaiting Concept Review): Sanjiv Bhaiyaji (+ admins on copy)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const APP_URL = Deno.env.get("APP_URL") || "https://rsm-srijan.lovable.app";
const CONCEPT_REVIEWER_EMAIL = "sanjiv@ramashram.in";

const esc = (s: string) =>
  String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));

const LEGACY: Record<string, string> = {
  preparing: "s1_preparing",
  concept_review: "s3_awaiting_concept",
  refinements: "s4_concept_approved",
  peer_review: "s6_awaiting_peer",
  ready: "s8_ready",
};

const stageOf = (metadata: any, status?: string): string => {
  const raw = metadata?.draft_stage as string | undefined;
  if (raw && raw.startsWith("s")) return raw;
  if (raw && LEGACY[raw]) return LEGACY[raw];
  if (status === "published") return "s9_published";
  if (status === "approved") return "s8_ready";
  if (status === "review") return "s6_awaiting_peer";
  return "s1_preparing";
};

function createRawEmail(from: string, to: string, cc: string[], subject: string, html: string): string {
  const lines = [`From: ${from}`, `To: ${to}`];
  if (cc.length) lines.push(`Cc: ${cc.join(", ")}`);
  const cleanSubject = String(subject || "Srijan notification").replace(/[\r\n]+/g, " ").trim();
  const subjectHeader = /^[\x20-\x7E]*$/.test(cleanSubject)
    ? cleanSubject
    : `=?UTF-8?B?${btoa(unescape(encodeURIComponent(cleanSubject)))}?=`;
  lines.push(`Subject: ${subjectHeader}`);
  lines.push("MIME-Version: 1.0", 'Content-Type: text/html; charset="UTF-8"', "", html);
  const msg = lines.join("\r\n");
  return btoa(unescape(encodeURIComponent(msg))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_MAIL_API_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_MAIL_API_KEY) {
      return new Response(JSON.stringify({ error: "Gmail connector not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [{ data: projects }, { data: users }] = await Promise.all([
      supabase.from("projects").select("id, title, status, metadata, owner_id"),
      supabase.from("users").select("id, name, email, role, content_roles").eq("approval_status", "approved"),
    ]);

    const allUsers = (users || []).filter((u: any) => u.email);
    const nameById = new Map(allUsers.map((u: any) => [u.id, u.name || u.email]));
    const emailById = new Map(allUsers.map((u: any) => [u.id, u.email]));
    const admins = allUsers.filter((u: any) => u.role === "admin");
    const builders = allUsers.filter((u: any) => (u.content_roles || []).includes("builder"));

    const send = async (fromName: string, to: string, cc: string[], subject: string, html: string) => {
      const raw = createRawEmail(`"${fromName}" <rsm.ai.labs@gmail.com>`, to, cc, subject, html);
      const resp = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
        },
        body: JSON.stringify({ raw }),
      });
      if (!resp.ok) console.error("send failed", resp.status, (await resp.text()).slice(0, 300));
      return resp.ok;
    };

    const shell = (heading: string, greeting: string, body: string, link: string) => `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
        <h2 style="color:#0c4a6e;">${esc(heading)}</h2>
        <p>${esc(greeting)}</p>
        ${body}
        <p><a href="${link}" style="display:inline-block;background:#0c4a6e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Open the draft</a></p>
        <p style="color:#888;font-size:12px;margin-top:24px;">All times shown are EST. — Srijan Content Platform</p>
      </div>`;

    let peerSent = 0;
    let conceptSent = 0;
    let skipped = 0;
    const MAX = 10;
    const DAY = 86400000;
    const now = Date.now();

    for (const p of projects || []) {
      const stage = stageOf(p.metadata, p.status);
      if (stage !== "s6_awaiting_peer" && stage !== "s3_awaiting_concept") continue;
      const link = `${APP_URL}/workspace/${p.id}`;
      const title = p.title || "Untitled";

      // Reminder cap tracking
      let rr: any = p.metadata?.review_reminders;
      if (!rr || rr.stage !== stage) {
        const enteredAt = p.metadata?.draft_stage_at || null;
        rr = { stage, count: 0, first_sent_at: null };
        if (enteredAt && now - new Date(enteredAt).getTime() >= MAX * DAY) {
          rr = { stage, count: MAX, first_sent_at: enteredAt };
        }
      }
      const expired = rr.first_sent_at && now - new Date(rr.first_sent_at).getTime() >= MAX * DAY;
      if (rr.count >= MAX || expired) {
        skipped++;
        if (p.metadata?.review_reminders?.stage !== stage || p.metadata?.review_reminders?.count !== rr.count) {
          await supabase.from("projects").update({ metadata: { ...(p.metadata || {}), review_reminders: rr } }).eq("id", p.id);
        }
        continue;
      }

      let ok = false;
      if (stage === "s6_awaiting_peer") {
        const ids: string[] = (p.metadata?.peer_reviewer_ids as string[] | undefined) ?? [];
        const reviewerNames = ids.map((id) => nameById.get(id)).filter(Boolean) as string[];
        const reviewerEmails = ids.map((id) => emailById.get(id)).filter(Boolean) as string[];
        const ccEmails = Array.from(
          new Set([...admins, ...builders].map((u: any) => u.email).filter((e: string) => !reviewerEmails.includes(e)))
        );
        const to = reviewerEmails.join(", ") || ccEmails.join(", ");
        if (!to) continue;
        const cc = reviewerEmails.length ? ccEmails : [];
        const namesPart =
          reviewerNames.length > 1
            ? `${reviewerNames.slice(0, -1).join(", ")}, ${reviewerNames[reviewerNames.length - 1]}`
            : reviewerNames[0] || "";
        const greeting = namesPart
          ? `Dear ${namesPart} and all Content Builders,`
          : "Dear all Content Builders,";
        const body = `
          <p>The draft <b>${esc(title)}</b> is <b>awaiting Peer Review</b>.</p>
          <p>Please share your review comments at the earliest.</p>`;
        ok = await send("Srijan Peer Review", to, cc, `Peer Review pending: ${title}`, shell("Peer Review pending", greeting, body, link));
        if (ok) peerSent++;
      } else {
        const cc = admins.map((a: any) => a.email).filter((e: string) => e !== CONCEPT_REVIEWER_EMAIL);
        const greeting = "Dear Sanjiv Bhaiyaji,";
        const body = `<p>The draft <b>${esc(title)}</b> is <b>awaiting your Concept Review</b>.</p>`;
        ok = await send("Srijan Concept Review", CONCEPT_REVIEWER_EMAIL, cc, `Concept Review pending: ${title}`, shell("Concept Review pending", greeting, body, link));
        if (ok) conceptSent++;
      }

      if (ok) {
        rr = { stage, count: rr.count + 1, first_sent_at: rr.first_sent_at || new Date().toISOString() };
        await supabase.from("projects").update({ metadata: { ...(p.metadata || {}), review_reminders: rr } }).eq("id", p.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, peerSent, conceptSent, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notify-pending-reviews error", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
