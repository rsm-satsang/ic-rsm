// Sends an email to the assigned user + all admins via Gmail connector
// when a task is assigned.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const {
      assigneeId,
      assignedById,
      taskTitle,
      taskDescription,
      projectId,
      projectTitle,
      dueDate,
    } = await req.json();

    if (!assigneeId || !taskTitle) {
      return new Response(JSON.stringify({ error: "assigneeId and taskTitle required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_MAIL_API_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_MAIL_API_KEY) {
      return new Response(JSON.stringify({ error: "Gmail connector not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [{ data: assignee }, { data: assigner }, { data: admins }] = await Promise.all([
      supabase.from("users").select("email, name").eq("id", assigneeId).maybeSingle(),
      assignedById
        ? supabase.from("users").select("email, name").eq("id", assignedById).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("users").select("email, name").eq("role", "admin"),
    ]);

    const recipients = new Map<string, string>();
    if (assignee?.email) recipients.set(assignee.email, assignee.name || "");
    for (const a of admins || []) {
      if (a.email) recipients.set(a.email, a.name || "");
    }

    if (recipients.size === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: "no recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const APP_URL = Deno.env.get("APP_URL") || "https://rsm-srijan.lovable.app";
    const link = projectId ? `${APP_URL}/workspace/${projectId}` : `${APP_URL}`;
    const fromHeader = `"Srijan Task Assignment" <rsm.ai.labs@gmail.com>`;
    const subject = `🪷 New Task Assigned: ${taskTitle}`;
    const assignerName = assigner?.name || assigner?.email || "A team member";
    const assigneeLabel = assignee?.name || assignee?.email || "team member";

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="color:#1e3a8a;">🪷 Task Assigned</h2>
        <p><b>${assignerName}</b> assigned a task to <b>${assigneeLabel}</b>.</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 12px;color:#555;"><b>Title</b></td><td style="padding:6px 12px;">${taskTitle}</td></tr>
          ${taskDescription ? `<tr><td style="padding:6px 12px;color:#555;vertical-align:top;"><b>Details</b></td><td style="padding:6px 12px;">${taskDescription}</td></tr>` : ""}
          ${projectTitle ? `<tr><td style="padding:6px 12px;color:#555;"><b>Project</b></td><td style="padding:6px 12px;">${projectTitle}</td></tr>` : ""}
          ${dueDate ? `<tr><td style="padding:6px 12px;color:#555;"><b>Due</b></td><td style="padding:6px 12px;">${dueDate}</td></tr>` : ""}
        </table>
        <p>
          <a href="${link}" style="display:inline-block;background:#1e3a8a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
            Open Workspace
          </a>
        </p>
        <p style="color:#888;font-size:12px;margin-top:8px;">If the button doesn't work, copy this link: <br/><span style="font-family:monospace;">${link}</span></p>
        <p style="color:#888;font-size:12px;margin-top:24px;">— Ram Chandra Mission Content Platform</p>
      </div>`;

    let sent = 0;
    const errors: string[] = [];
    for (const [email] of recipients) {
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
    console.error("notify-assignment error", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
