// Send a weekly reminder email to all assignees (Plan / Build / Operate)
// for a particular tracker week card, plus CC all admins.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function createRawEmail(from: string, to: string, subject: string, html: string): string {
  const msg = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ].join("\r\n");
  const b64 = btoa(unescape(encodeURIComponent(msg)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

interface Phase {
  assignee_id?: string | null;      // legacy single
  assignee_ids?: string[] | null;   // new multi
  due?: string | null;
  description?: string | null;
}

interface PlanContext {
  topic?: string | null;
  plan_comments?: string | null;
  linked_project_title?: string | null;
  linked_project_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      contentId,
      weekLabel,
      title,
      status,
      recipients = [],
      plan = {} as Phase,
      build = {} as Phase,
      operate = {} as Phase,
      planContext = null as PlanContext | null,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_MAIL_API_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_MAIL_API_KEY) {
      return new Response(JSON.stringify({ error: "Gmail connector not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: admins } = await supabase.from("users").select("email, name").eq("role", "admin");

    const emailMap = new Map<string, string>();
    for (const r of recipients) {
      if (r?.email) emailMap.set(r.email, r.name || "");
    }
    for (const a of admins || []) {
      if (a.email) emailMap.set(a.email, a.name || "");
    }

    if (emailMap.size === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: "no recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Collect assignee ids across phases (both new array + legacy single)
    const phaseIds = (p: Phase) => {
      const list: string[] = [];
      if (Array.isArray(p.assignee_ids)) list.push(...p.assignee_ids.filter(Boolean) as string[]);
      if (p.assignee_id) list.push(p.assignee_id);
      return Array.from(new Set(list));
    };
    const allIds = Array.from(new Set([...phaseIds(plan), ...phaseIds(build), ...phaseIds(operate)]));
    let nameMap = new Map<string, string>();
    if (allIds.length) {
      const { data: us } = await supabase.from("users").select("id, name, email").in("id", allIds);
      for (const u of us || []) nameMap.set(u.id, u.name || u.email || "—");
    }
    const namesFor = (p: Phase) => {
      const ids = phaseIds(p);
      if (ids.length === 0) return "—";
      return ids.map((id) => nameMap.get(id) || "—").join(", ");
    };

    const APP_URL = Deno.env.get("APP_URL") || "https://rsm-srijan.lovable.app";
    const link = `${APP_URL}/tracker`;
    const fromHeader = `"Srijan Newsletter Reminder" <rsm.ai.labs@gmail.com>`;
    const subject = `Reminder: ${title} (${weekLabel})`;

    const phaseRow = (label: string, p: Phase) => {
      const ids = phaseIds(p);
      if (ids.length === 0 && !p.due && !p.description) return "";
      return `
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;"><b>${label}</b></td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;">${namesFor(p)}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;">${p.due || "—"}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;">${p.description || "—"}</td>
      </tr>`;
    };

    // Build additional plan context block (for Build-phase reminders)
    const planContextBlock = planContext && (planContext.topic || planContext.plan_comments || planContext.linked_project_title) ? `
      <div style="margin:16px 0;padding:12px 16px;background:#fefce8;border:1px solid #fde68a;border-radius:6px;">
        <div style="font-weight:bold;color:#92400e;margin-bottom:6px;">📋 Context from the Planner</div>
        ${planContext.topic ? `<div style="margin:4px 0;"><b>Topic:</b> ${escapeHtml(planContext.topic)}</div>` : ""}
        ${planContext.plan_comments ? `<div style="margin:4px 0;"><b>Plan notes:</b><br/><span style="white-space:pre-wrap;">${escapeHtml(planContext.plan_comments)}</span></div>` : ""}
        ${planContext.linked_project_title ? `<div style="margin:4px 0;"><b>Linked project:</b> ${escapeHtml(planContext.linked_project_title)}${planContext.linked_project_id ? ` — <a href="${APP_URL}/workspace/${planContext.linked_project_id}">Open</a>` : ""}</div>` : ""}
      </div>` : "";

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;">
        <h2 style="color:#0c4a6e;">🪷 Weekly Content Reminder</h2>
        <p>This is a reminder for the following weekly content card:</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 12px;color:#555;"><b>Content</b></td><td style="padding:6px 12px;">${title}</td></tr>
          <tr><td style="padding:6px 12px;color:#555;"><b>Content ID</b></td><td style="padding:6px 12px;font-family:monospace;">${contentId}</td></tr>
          <tr><td style="padding:6px 12px;color:#555;"><b>Week</b></td><td style="padding:6px 12px;">${weekLabel}</td></tr>
          <tr><td style="padding:6px 12px;color:#555;"><b>Current Status</b></td><td style="padding:6px 12px;"><b>${status}</b></td></tr>
        </table>

        ${planContextBlock}

        <table style="border-collapse:collapse;width:100%;margin:12px 0;">
          <thead>
            <tr style="background:#f0f9ff;">
              <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Phase</th>
              <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Assignee(s)</th>
              <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Due</th>
              <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Description</th>
            </tr>
          </thead>
          <tbody>
            ${phaseRow("Plan", plan)}
            ${phaseRow("Build", build)}
            ${phaseRow("Operate / Publish", operate)}
          </tbody>
        </table>

        <p>
          <a href="${link}" style="display:inline-block;background:#0c4a6e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
            Open Tracker
          </a>
        </p>
        <p style="color:#888;font-size:12px;margin-top:24px;">— Srijan Content Platform</p>
      </div>`;

    let sent = 0;
    const errors: string[] = [];
    for (const [email] of emailMap) {
      const raw = createRawEmail(fromHeader, email, subject, html);
      const resp = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
        },
        body: JSON.stringify({ raw }),
      });
      if (resp.ok) sent++;
      else {
        const text = await resp.text();
        errors.push(`${email}: ${resp.status} ${text.slice(0, 200)}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notify-week-assignees error", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
