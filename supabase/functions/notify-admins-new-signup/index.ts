// Sends an email to all admin users via the Gmail connector gateway
// when a new user signs up and is awaiting approval.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function createRawEmail(to: string, subject: string, html: string): string {
  const msg = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ].join("\r\n");
  // base64url encode (UTF-8 safe)
  const b64 = btoa(unescape(encodeURIComponent(msg)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { newUserEmail, newUserName, newUserId } = await req.json();
    if (!newUserEmail) {
      return new Response(JSON.stringify({ error: "newUserEmail required" }), {
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

    // Look up admins using the service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: admins, error: adminErr } = await supabase
      .from("users")
      .select("email, name")
      .eq("role", "admin");

    if (adminErr) throw adminErr;
    if (!admins?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: "no admins" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const approveUrl = `${Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") || ""}/admin/users`;
    const subject = `New signup pending approval: ${newUserName || newUserEmail}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="color:#1e3a8a;">🌸 New User Signup</h2>
        <p>A new user has signed up and is awaiting your approval:</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 12px;color:#555;"><b>Name</b></td><td style="padding:6px 12px;">${newUserName || "—"}</td></tr>
          <tr><td style="padding:6px 12px;color:#555;"><b>Email</b></td><td style="padding:6px 12px;">${newUserEmail}</td></tr>
          <tr><td style="padding:6px 12px;color:#555;"><b>User ID</b></td><td style="padding:6px 12px;font-family:monospace;font-size:12px;">${newUserId || "—"}</td></tr>
        </table>
        <p>
          <a href="${approveUrl}" style="display:inline-block;background:#1e3a8a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
            Review &amp; Approve
          </a>
        </p>
        <p style="color:#888;font-size:12px;margin-top:24px;">— Ram Chandra Mission Content Platform</p>
      </div>`;

    let sent = 0;
    const errors: string[] = [];
    for (const admin of admins) {
      if (!admin.email) continue;
      const raw = createRawEmail(admin.email, subject, html);
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
        errors.push(`${admin.email}: ${resp.status} ${text.slice(0, 200)}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notify-admins-new-signup error", e);
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
