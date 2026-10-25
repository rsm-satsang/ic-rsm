import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { eligibleAdmins, makeReport } from './report.ts';

const input = z.object({ runId: z.string().uuid() }).strict();
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), b => String.fromCharCode(b)).join(''));

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'POST required' }, 405);
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ error: 'Invalid report request' }, 400);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const mailKey = Deno.env.get('GOOGLE_MAIL_API_KEY');
  const gatewayKey = Deno.env.get('LOVABLE_API_KEY');
  if (!url || !serviceKey || !mailKey || !gatewayKey) return reply({ error: 'Email service configuration missing' }, 500);
  const db = createClient(url, serviceKey);
  // The callback capability is created in a service-only table by cron. It cannot
  // be minted or read by anonymous/authenticated app users. Never return it.
  const { data: run, error: claimError } = await db.from('weekly_newsletter_report_runs')
    .update({ status: 'running' }).eq('id', parsed.data.runId).eq('status', 'pending')
    .select('id, report_date').maybeSingle();
  if (claimError) return reply({ error: 'Could not claim report' }, 500);
  if (!run) return reply({ error: 'Invalid or already processed report request' }, 403);
  try {
    async function allRows(table: string, columns: string) {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.from(table).select(columns).order('id').range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return rows;
    }
    const [projects, entries, users] = await Promise.all([
      allRows('projects', 'id,title,status,metadata'),
      allRows('tracker_entries', 'id,channel,sub_channel,status,source,source_url,publish_date,week_start_date,substack_published'),
      allRows('users', 'id,email,approval_status,role'),
    ]);
    const report = makeReport(run.report_date, projects, entries);
    const recipients = eligibleAdmins(users).filter(u => z.string().email().safeParse(u.email).success);
    const unique = recipients.filter((u, i) => recipients.findIndex(v => v.email.toLowerCase() === u.email.toLowerCase()) === i);
    const { error: saveError } = await db.from('weekly_newsletter_report_runs').update({ report_text: report.text, recipient_count: unique.length }).eq('id', run.id);
    if (saveError) throw saveError;
    const subject = `Weekly Srijan Newsletter Report · Week ${report.elapsed}`;
    let sent = 0;
    let failed = 0;
    for (const u of unique) {
      const msg = [
        'From: "Srijan Weekly Newsletter Report" <rsm.ai.labs@gmail.com>',
        `To: ${u.email}`,
        `Subject: =?UTF-8?B?${b64(subject)}?=`,
        'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', '', report.text,
      ].join('\r\n');
      let messageId: string | null = null;
      let errorText: string | null = null;
      try {
        const response = await fetch('https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gatewayKey}`, 'X-Connection-Api-Key': mailKey },
          body: JSON.stringify({ raw: b64(msg).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }),
        });
        if (!response.ok) throw new Error(`Gmail ${response.status}: ${(await response.text()).slice(0, 500)}`);
        const result = await response.json();
        if (!result.id) throw new Error('Gmail did not confirm a message ID');
        messageId = result.id;
        sent++;
      } catch (error) {
        failed++;
        errorText = error instanceof Error ? error.message : String(error);
      }
      const { error: deliveryError } = await db.from('weekly_newsletter_report_deliveries').insert({ run_id: run.id, user_id: u.id, status: messageId ? 'sent' : 'failed', message_id: messageId, error: errorText });
      if (deliveryError) throw deliveryError;
    }
    const { error: finishError } = await db.from('weekly_newsletter_report_runs').update({ status: failed ? 'partial_failure' : 'sent', sent_count: sent, failed_count: failed }).eq('id', run.id);
    if (finishError) throw finishError;
    return reply({ ok: failed === 0, sent, failed }, failed ? 502 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from('weekly_newsletter_report_runs').update({ status: 'failed', error: message }).eq('id', run.id);
    return reply({ error: message }, 500);
  }
});