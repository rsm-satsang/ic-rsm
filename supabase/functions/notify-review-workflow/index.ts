// Emails for the draft review workflow:
//  - kind "concept": concept review submitted -> addressed to Sanjeev Bhaiya ji, copy to all admins
//  - kind "peer": peer review assigned -> assigned reviewers + all admins
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const TZ = "America/New_York";

const esc = (s: string) =>
  String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));

const fmtDate = (s?: string) => {
  if (!s) return "not set";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00Z` : s);
  if (isNaN(d.getTime())) return "not set";
  return `${d.toLocaleDateString("en-US", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" })} EST`;
};

function createRawEmail(from: string, to: string, cc: string[], subject: string, html: string): string {
  const lines = [`From: ${from}`, `To: ${to}`];
  if (cc.length) lines.push(`Cc: ${cc.join(", ")}`);
  lines.push("MIME-Version: 1.0", 'Content-Type: text/html; charset="UTF-8"', "", html);
  const msg = lines.join("\r\n");
  return btoa(unescape(encodeURIComponent(msg))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { kind, projectId, dueDate, note, submittedBy, reviewerIds } = await req.json();
    if (!kind || !projectId) {
      return new Response(JSON.stringify({ error: "kind and projectId required" }), {
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
    const { data: adminRows } = await supabase
      .from("users").select("id, name, email").eq("role", "admin").eq("approval_status", "approved");
    const admins = (adminRows || []).filter((a: any) => a.email);

    const APP_URL = Deno.env.get("APP_URL") || "https://rsm-srijan.lovable.app";
    const link = `${APP_URL}/workspace/${projectId}`;
    const title = project?.title || "Untitled";
    const due = fmtDate(dueDate);

    let to = "";
    let cc: string[] = [];
    let subject = "";
    let greeting = "";
    let body = "";
    let fromHeader = "";

    if (kind === "concept") {
      const sanjeev = admins.find((a: any) => /sanj[ie]v/i.test(a.name || "") || /sanjiv@/i.test(a.email));
      to = sanjeev?.email || admins[0]?.email || "";
      cc = admins.map((a: any) => a.email).filter((e: string) => e !== to);
      greeting = "Dear Sanjeev Bhaiya ji,";
      subject = `Concept Review requested for ${title}`;
      fromHeader = `"Srijan Concept Review" <rsm.ai.labs@gmail.com>`;
      body = `
        <p>A concept review has been submitted for <b>${esc(title)}</b>${submittedBy ? ` by <b>${esc(submittedBy)}</b>` : ""}.</p>
        <p><b>Review due by:</b> ${due}</p>
        ${note ? `<blockquote style="border-left:3px solid #0c4a6e;padding:8px 12px;background:#f1f5f9;white-space:pre-wrap;">${esc(note)}</blockquote>` : ""}`;
    } else if (kind === "peer") {
      const ids: string[] = Array.isArray(reviewerIds) ? reviewerIds : [];
      const { data: revRows } = ids.length
        ? await supabase.from("users").select("id, name, email").in("id", ids)
        : { data: [] as any[] };
      const reviewers = (revRows || []).filter((r: any) => r.email);
      if (reviewers.length === 0 && admins.length === 0) {
        return new Response(JSON.stringify({ ok: true, sent: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      to = reviewers.map((r: any) => r.email).join(", ") || admins[0].email;
      cc = admins.map((a: any) => a.email).filter((e: string) => !to.includes(e));
      greeting = `Dear ${reviewers.map((r: any) => r.name).join(" and ") || "Reviewers"},`;
      subject = `Peer Review assigned for ${title}`;
      fromHeader = `"Srijan Peer Review" <rsm.ai.labs@gmail.com>`;
      body = `
        <p>You have been assigned as a peer reviewer for <b>${esc(title)}</b>${submittedBy ? ` by <b>${esc(submittedBy)}</b>` : ""}.</p>
        <p><b>Review due by:</b> ${due}</p>
        ${note ? `<blockquote style="border-left:3px solid #0c4a6e;padding:8px 12px;background:#f1f5f9;white-space:pre-wrap;">${esc(note)}</blockquote>` : ""}`;
    } else {
      return new Response(JSON.stringify({ error: "unknown kind" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!to) {
      return new Response(JSON.stringify({ ok: true, sent: 0, recipients: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
        <h2 style="color:#0c4a6e;">${kind === "concept" ? "Concept Review requested" : "Peer Review assigned"}</h2>
        <p>${esc(greeting)}</p>
        ${body}
        <p><a href="${link}" style="display:inline-block;background:#0c4a6e;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Open the draft</a></p>
        <p style="color:#888;font-size:12px;margin-top:24px;">All times shown are EST. — Srijan Content Platform</p>
      </div>`;

    const raw = createRawEmail(fromHeader, to, cc, subject, html);
    const resp = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAIL_API_KEY,
      },
      body: JSON.stringify({ raw }),
    });

    if (!resp.ok) {
      const errText = (await resp.text()).slice(0, 300);
      console.error("notify-review-workflow send failed", resp.status, errText);
      return new Response(JSON.stringify({ ok: false, error: errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, sent: 1, to, cc }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notify-review-workflow error", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
