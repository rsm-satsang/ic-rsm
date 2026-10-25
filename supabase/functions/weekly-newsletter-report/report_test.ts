import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { eligibleAdmins, makeReport } from './report.ts';
const p = (title: string, goal = 'substack_newsletter', archived = false, stage = 's1_preparing') => ({ title, status: 'in_progress', metadata: { goal, archived, draft_stage: stage } });
Deno.test('pipeline excludes archived and non-newsletter projects', () => {
  const r = makeReport('2026-10-25', [p('Keep'), p('Archived', undefined, true), p('Video', 'video_to_youtube_short')], []);
  assertEquals(r.pipelineCount, 1);
});
Deno.test('published drafts are excluded from pipeline', () => {
  assertEquals(makeReport('2026-10-25', [p('Published', undefined, false, 's9_published')], []).pipelineCount, 0);
});
Deno.test('Week 1 begins January 5 2026 with 52 weeks total', () => {
  const r = makeReport('2026-10-25', [], []);
  assertEquals(r.elapsed, 42);
  assertEquals(r.remaining, 10);
  assertEquals(makeReport('2026-01-05', [], []).elapsed, 1);
});
Deno.test('titles appear under each draft stage', () => {
  const r = makeReport('2026-10-25', [p('Restoring the Forgotten Light Within', undefined, false, 's6_awaiting_peer'), p('First draft')], []);
  assertStringIncludes(r.text, 'Stage 6 · Awaiting Peer Review (1)');
  assertStringIncludes(r.text, 'Restoring the Forgotten Light Within');
  assertEquals(r.pipelineCount, 2);
});
Deno.test('weekly report goes only to approved admins', () => {
  const base = { id: 'admin', email: 'admin@example.com', role: 'admin', approval_status: 'approved' };
  assertEquals(eligibleAdmins([base, { ...base, id: 'user', role: 'user' }, { ...base, id: 'suspended', approval_status: 'suspended' }]).map(u => u.id), ['admin']);
});
Deno.test('publication count counts posts and uses real dates for elapsed days', () => {
  const e = { id: '1', channel: 'substack_satsang', sub_channel: 'newsletter', status: 'published', source: 'substack', source_url: 'post1', publish_date: '2026-08-29', week_start_date: '2026-08-24', substack_published: true };
  const r = makeReport('2026-10-25', [], [e, { ...e, id: '2', source_url: 'post2' }, { ...e, id: '3' }, { ...e, id: '4', source_url: 'future', publish_date: '2026-11-01' }]);
  assertEquals(r.published, 2);
  assertEquals(r.days, 57);
});
Deno.test('15 verified Satsang posts exclude four manual weeks and one Lifequest post', () => {
  const base = { id: '1', channel: 'substack_satsang', sub_channel: 'newsletter', status: 'published', source: 'substack', source_url: 'post1', publish_date: '2026-09-28', week_start_date: '2026-09-28', substack_published: false };
  const posts = Array.from({ length: 15 }, (_, i) => ({ ...base, id: `post-${i}`, source_url: `post-${i}` }));
  const manual = Array.from({ length: 4 }, (_, i) => ({ ...base, id: `manual-${i}`, source: 'auto', source_url: null, publish_date: null, substack_published: true }));
  const r = makeReport('2026-10-25', [], [...posts, ...manual, { ...base, id: 'lifequest', channel: 'substack_lifequest', source_url: 'lifequest-post' }]);
  assertEquals(r.published, 15);
  assertEquals(r.days, 27);
});