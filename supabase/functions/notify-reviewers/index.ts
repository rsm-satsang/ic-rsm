// Notify all Builder users + admins that a draft is ready for review.
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
    const { projectId, versionId, requesterId, recipientEmails } = await req.json();
    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId required" }), {
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

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: project } = await supabase.from("projects").select("title").eq("id", projectId).maybeSingle();

    let versionLabel = "Latest";
    if (versionId) {
      const { data: v } = await supabase
        .from("versions")
        .select("title, version_number")
        .eq("id", versionId)
        .maybeSingle();
      if (v) versionLabel = `${v.title || "Untitled"} (v${v.version_number ?? "?"})`;
    }

    // Recipients: admins + builders. We treat "builder" as anyone with role
    // 'builder' OR 'admin'. Fallback: include all approved users with role != 'viewer'.
    // Notify all approved admins + builders. The app_role enum only contains
    // 'admin' and 'user' — 'user' is treated as the Builder role. Passing
    // 'builder' would error the entire query with "invalid input value for
    // enum app_role".
    const { data: recipients, error: recipientsError } = await supabase
      .from("users")
      .select("email, name, role, approval_status")
      .in("role", ["admin", "user"])
      .eq("approval_status", "approved");
    if (recipientsError) console.error("recipients query error", recipientsError);
    console.log("notify-reviewers recipients:", recipients?.length ?? 0);

    let requesterName = "A teammate";
    if (requesterId) {
      const { data: ru } = await supabase.from("users").select("name").eq("id", requesterId).maybeSingle();
      if (ru?.name) requesterName = ru.name;
    }

    const APP_URL = Deno.env.get("APP_URL") || "https://rsm-srijan.lovable.app";
    const link = `${APP_URL}/workspace/${projectId}`;
    const fromHeader = `"RSM Srijan Newsletter Review Request" <rsm.ai.labs@gmail.com>`;
    const subject = `Review requested: ${project?.title || "Untitled"} - ${versionLabel}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
        <h2 style="color:#0c4a6e;">📝 Draft ready for review</h2>
        <p>${requesterName} has marked a draft ready for review.</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 12px;color:#555;"><b>Project</b></td><td style="padding:6px 12px;">${project?.title || "Untitled"}</td></tr>
          <tr><td style="padding:6px 12px;color:#555;"><b>Draft / Version</b></td><td style="padding:6px 12px;">${versionLabel}</td></tr>
        </table>
        <p>
          <a href="${link}" style="display:inline-block;background:#0c4a6e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
            Open in workspace
          </a>
        </p>
        <p style="color:#888;font-size:12px;margin-top:24px;">— Srijan Content Platform</p>
      </div>`;

    const emails = Array.from(new Set((recipients || []).map((r: any) => r.email).filter(Boolean)));
    let sent = 0;
    const errors: string[] = [];
    for (const email of emails) {
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
      else errors.push(`${email}: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
    }

    // Insert in-app notifications so reviewers see the task in "My Assigned Tasks"
    const notifRecipientIds = (recipients || [])
      .filter((r: any) => r.email && (!requesterId || r.email))
      .map((r: any) => r.email);
    const { data: notifUsers } = await supabase
      .from("users")
      .select("id, email")
      .in("email", notifRecipientIds.length ? notifRecipientIds : ["__none__"]);
    const notifRows = (notifUsers || [])
      .filter((u: any) => u.id !== requesterId)
      .map((u: any) => ({
        user_id: u.id,
        actor_id: requesterId || null,
        type: "review_request",
        entity_type: "version",
        entity_id: versionId || null,
        project_id: projectId,
        message: `${requesterName} asked you to review "${project?.title || "Untitled"}" — ${versionLabel}`,
        link: `/workspace/${projectId}`,
      }));
    if (notifRows.length) {
      await supabase.from("notifications").insert(notifRows);
    }

    return new Response(JSON.stringify({ ok: true, sent, recipients: emails, errors, notified: notifRows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notify-reviewers error", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
