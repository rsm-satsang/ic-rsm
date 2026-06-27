// Notify admins + builders (reviewers) by email when a new review comment is added.
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
  return btoa(unescape(encodeURIComponent(msg))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { projectId, commentId, commentText, authorId } = await req.json();
    if (!projectId || !commentText) {
      return new Response(JSON.stringify({ error: "projectId and commentText required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_MAIL_API_KEY = Deno.env.get("GOOGLE_MAIL_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_MAIL_API_KEY) {
      return new Response(JSON.stringify({ error: "Gmail connector not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: project } = await supabase.from("projects").select("title").eq("id", projectId).maybeSingle();

    let authorName = "A reviewer";
    if (authorId) {
      const { data: a } = await supabase.from("users").select("name").eq("id", authorId).maybeSingle();
      if (a?.name) authorName = a.name;
    }

    const { data: recipients } = await supabase
      .from("users")
      .select("email, id, name")
      .in("role", ["admin", "user"])
      .eq("approval_status", "approved");

    const filtered = (recipients || []).filter(
      (r: any) => r.id !== authorId && r.email
    );
    const emails = Array.from(new Set(filtered.map((r: any) => r.email)));
    console.log(`notify-comment: ${emails.length} recipients for project ${projectId}`);

    const APP_URL = Deno.env.get("APP_URL") || "https://rsm-srijan.lovable.app";
    const link = `${APP_URL}/workspace/${projectId}`;
    const fromHeader = `"RSM Srijan Review Comment" <rsm.ai.labs@gmail.com>`;
    const when = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    const subject = `New review comment on ${project?.title || "Untitled"} from ${authorName}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
        <h2 style="color:#0c4a6e;">💬 New review comment</h2>
        <p><b>${authorName}</b> added a comment on <b>${project?.title || "Untitled"}</b> on ${when}.</p>
        <blockquote style="border-left:3px solid #0c4a6e;padding:8px 12px;color:#333;background:#f1f5f9;margin:12px 0;white-space:pre-wrap;">${
          commentText.replace(/[<>&]/g, (c: string) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" } as any)[c])
        }</blockquote>
        <p><a href="${link}" style="display:inline-block;background:#0c4a6e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Open in workspace</a></p>
        <p style="color:#888;font-size:12px;margin-top:24px;">— Srijan Content Platform</p>
      </div>`;

    let sent = 0;
    const errors: string[] = [];
    const sentTo: { email: string; name: string | null }[] = [];
    for (const r of filtered) {
      const raw = createRawEmail(fromHeader, r.email, subject, html);
      const resp = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
        },
        body: JSON.stringify({ raw }),
      });
      if (resp.ok) {
        sent++;
        sentTo.push({ email: r.email, name: r.name });
      } else {
        const errText = (await resp.text()).slice(0, 200);
        console.error(`notify-comment send failed for ${r.email}: ${resp.status} ${errText}`);
        errors.push(`${r.email}: ${resp.status} ${errText}`);
      }
    }
    console.log(`notify-comment: sent=${sent}, errors=${errors.length}`);

    return new Response(JSON.stringify({ ok: true, sent, recipients: emails, sentTo, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notify-comment error", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
