export const STAGES = [
  ['s1_preparing', 'Stage 1 · Preparing First Draft'],
  ['s2_submit_concept', 'Stage 2 · Submit for Concept Review'],
  ['s3_awaiting_concept', 'Stage 3 · Awaiting Concept Review'],
  ['s4_concept_approved', 'Stage 4 · Concept Approved'],
  ['s5_submit_peer', 'Stage 5 · Submit for Peer Review'],
  ['s6_awaiting_peer', 'Stage 6 · Awaiting Peer Review'],
  ['s7_peer_done', 'Stage 7 · Peer Review Done'],
  ['s7_awaiting_final', 'Stage 8 · Awaiting Final Go Ahead'],
  ['s8_ready', 'Stage 9 · Ready to Publish'],
  ['s9_published', 'Stage 10 · Published'],
] as const;
type Project = { title: string; status: string; metadata?: Record<string, unknown> | null };
type Publication = { id: string; channel: string; sub_channel: string; status: string; source: string; source_url?: string | null; publish_date?: string | null; week_start_date: string; substack_published: boolean };
export function eligibleAdmins(users: { id: string; email: string; role: string; approval_status: string }[]) {
  return users.filter(u => u.role === 'admin' && u.approval_status === 'approved');
}
const DAY = 86400000;
export function stageOf(p: Project): string {
  const raw = p.metadata?.draft_stage;
  const legacy: Record<string, string> = { preparing: 's1_preparing', concept_review: 's3_awaiting_concept', refinements: 's4_concept_approved', peer_review: 's6_awaiting_peer', ready: 's8_ready' };
  if (typeof raw === 'string' && STAGES.some(([s]) => s === raw)) return raw;
  if (typeof raw === 'string' && legacy[raw]) return legacy[raw];
  return p.status === 'published' ? 's9_published' : p.status === 'approved' ? 's8_ready' : p.status === 'review' ? 's6_awaiting_peer' : 's1_preparing';
}
export function makeReport(today: string, projects: Project[], entries: Publication[]) {
  const now = new Date(`${today}T00:00:00Z`);
  const year = now.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 1));
  first.setUTCDate(first.getUTCDate() + (8 - first.getUTCDay()) % 7);
  const totalWeeks = Math.floor((Date.UTC(year, 11, 31) - first.getTime()) / (7 * DAY)) + 1;
  const elapsed = Math.max(0, Math.min(totalWeeks, Math.floor((now.getTime() - first.getTime()) / (7 * DAY)) + 1));
  const weekStart = new Date(first.getTime() + Math.max(0, elapsed - 1) * 7 * DAY);
  const weekEnd = new Date(weekStart.getTime() + 6 * DAY);
  const fmt = (date: Date) => date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' });
  const pipeline = projects.filter(p => p.metadata?.goal === 'substack_newsletter' && p.metadata?.archived !== true && stageOf(p) !== 's9_published');
  // Count posts, not occupied weeks; source URLs suppress duplicate imported rows.
  const seen = new Set<string>();
  const publications = entries.filter(e => {
    if (e.channel !== 'substack_satsang' || e.sub_channel !== 'newsletter' || e.source !== 'substack' || !e.source_url || !e.publish_date) return false;
    const date = e.publish_date || e.week_start_date;
    if (date > today) return false;
    const key = e.source_url || e.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const published = publications.filter(e => (e.publish_date || e.week_start_date).startsWith(`${year}-`)).length;
  // Only an explicit publication date establishes days since publication.
  const last = publications.map(e => e.publish_date).filter((d): d is string => Boolean(d)).sort().at(-1);
  const days = last ? Math.floor((now.getTime() - new Date(`${last}T00:00:00Z`).getTime()) / DAY) : null;
  const lines = [
    '# 🌿 Weekly Srijan Newsletter Production Report',
    `**Week ${elapsed} · ${fmt(weekStart)} – ${fmt(weekEnd)}, ${year}**`, '',
    '### 🕊️ Overall Newsletter Status',
    `* **Elapsed Weeks (${year}):** ${elapsed}`,
    `* **Satsang Newsletters Published:** ${published}`,
    `* **Weeks Remaining:** ${totalWeeks - elapsed}`,
    `* **Days Since Last Recorded Publication:** ${days === null ? 'Not available' : `${days} (${last})`}`,
    `* **Substack Drafts in Pipeline:** ${pipeline.length} active drafts`,
  ];
  for (const [stage, label] of [...STAGES].reverse()) {
    const titles = pipeline.filter(p => stageOf(p) === stage).map(p => p.title).sort((a, b) => a.localeCompare(b));
    if (!titles.length) continue;
    lines.push(stage === 's1_preparing'
      ? `  * **${label}:** ${titles.length} drafts in initial preparation`
      : `  * **${label} (${titles.length}):** ${titles.map(title => title.replace(/[\r\n]+/g, ' ')).join('; ')}`);
  }
  const undated = publications.filter(e => !e.publish_date && e.week_start_date.startsWith(`${year}-`)).length;
  if (undated) lines.push(`\n*${undated} published entries have no exact publication date.*`);
  return { text: lines.join('\n'), elapsed, published, remaining: totalWeeks - elapsed, days, pipelineCount: pipeline.length };
}