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

interface Phase {
  assignee_id?: string | null;
  due?: string | null;
  description?: string | null;
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

    // Resolve assignee names
    const ids = [plan.assignee_id, build.assignee_id, operate.assignee_id].filter(Boolean) as string[];
    let nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: us } = await supabase.from("users").select("id, name, email").in("id", ids);
      for (const u of us || []) nameMap.set(u.id, u.name || u.email || "—");
    }
    const nm = (id?: string | null) => (id ? nameMap.get(id) || "—" : "—");

    const APP_URL = Deno.env.get("APP_URL") || "https://rsm-srijan.lovable.app";
    const link = `${APP_URL}/tracker`;
    const fromHeader = `"Srijan Newsletter Reminder" <rsm.ai.labs@gmail.com>`;
    const subject = `🪷 Reminder: ${title} (${weekLabel})`;

    const phaseRow = (label: string, p: Phase) => `
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;"><b>${label}</b></td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;">${nm(p.assignee_id)}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;">${p.due || "—"}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;">${p.description || "—"}</td>
      </tr>`;

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

        <table style="border-collapse:collapse;width:100%;margin:12px 0;">
          <thead>
            <tr style="background:#f0f9ff;">
              <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Phase</th>
              <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Assignee</th>
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
