# Implementation Plan

This is a large, multi-part request. I'll break it into 4 phases. Each phase ships independently and is testable before moving to the next. Please confirm scope and priority before I start — we can drop or defer phases.

---

## Phase 1 — Quick UI fix: Surface the "Assign" button

**Scope:** UI-only relocation.
- Move the existing "Assign" action out of the **Manage** dropdown on task/content cards.
- Render it as a standalone button next to Manage on the card.
- No logic, permission, notification, or workflow changes.

**Files:** likely `src/components/workspace/ManagePanel.tsx`, dashboard task cards, `MyAssignedTasksSection.tsx`.

---

## Phase 2 — Content Production Tracker (2026)

**New route:** `/tracker` with 3 tabs: Substack Newsletter (Satsang), LifeQuest Newsletter, YouTube (sub-tabs: Long-form / Shorts).

### Database (new tables)
- `tracker_entries` — one row per (channel, sub_channel, week_start_date)
  - fields: channel, sub_channel, week_start_date (Mon), title, publish_date, theme_id, assignee_id, status, due_date, notes, source ('manual'|'substack'|'youtube'), source_url
- `content_targets` — channel, sub_channel, per_week count (seeded: 1/week each)
- Reuse existing `themes` table for "Assign Theme".
- RLS: authenticated read/write (matches project convention of universal access).
- GRANTs included per platform rules.

### Calendar view
- Generates all 52 weeks of 2026 (Mon-start) on the fly.
- Each week = card with: Title, Type, Publish Date, Theme, Assignee, Status (🟢🟡🔴⚪⚫), Due Date, Notes.
- Inline edit on each card (status dropdown, assignee picker, theme picker).
- Filters: Month, Quarter, Year, Assignee, Status.

### Analytics strip (top of tracker)
Per channel: Total Planned / Published / Draft / Missing, plus color-coded count badges.

### Gap analysis panel
Lists missing weeks per channel.

### Substack auto-import
New edge function `tracker-sync-substack`:
- Fetches Substack RSS for the configured publication (`SUBSTACK_API_KEY` already present; uses public RSS if not authenticated).
- For each post in 2026, computes the Monday of that week, upserts a `tracker_entries` row for channel='substack' with status='published'.
- Triggered by a "Sync Substack" button on the Substack tab.

### YouTube (manual for now)
- Long-form and Shorts entries entered manually or imported from existing video projects in the DB.
- Auto-link: any `projects` row of type=video with published status maps to its week.

---

## Phase 3 — Comments & Collaboration

### Database
- Extend existing `comments` table (already has 9 cols, 4 policies — I'll inspect schema first) to support: `parent_id` (threading), `resolved_at`, `mentions` (uuid[]), `entity_type` ('version'|'tracker_entry'|'project').
- New `notifications` table: user_id, type ('mention'|'assignment'|'reply'|'status_change'), actor_id, entity_type, entity_id, message, read_at, created_at.
- RLS: user reads/updates own notifications; system inserts.

### UI
- Comments panel inside `Workspace.tsx` editor (right sidebar tab).
- Threaded replies, edit/delete (author only), resolve (any collaborator).
- `@mention` autocomplete pulling from `users` table → writes to `mentions` array.
- Mention/assignment/reply → inserts notification row → appears in existing `/notifications` page (already routed).
- Mentioned/assigned items appear in `MyAssignedTasksSection` on dashboard.

### Timeline integration
- Comment events written to existing `timeline` table (event_type='comment_added', 'comment_resolved', etc.) — already used for project events.

---

## Phase 4 — Admin Approval Workflow

### Database
- Extend `users` table: `approval_status` enum ('pending_email','pending_approval','approved','rejected','suspended'), `approved_by`, `approved_at`, `rejection_notes`.
- Default new signups: `pending_approval` (after email verify trigger fires).
- New `user_audit_log` table: actor_id, target_user_id, action, notes, created_at.

### Auth changes
- `Auth.tsx` login: after `signInWithPassword`, check `approval_status`. Block with clear message for each non-approved state and sign the user back out.
- Update `handle_new_user` trigger to set status to `pending_approval`.

### Admin email notification
- Edge function `notify-admins-new-signup` triggered by DB trigger (or called from `handle_new_user`).
- Uses existing email infra (Lovable Emails) — would need `email_domain--setup_email_infra` + scaffold if not already set up. I'll check status first.
- Email lists name/email/signup date with Approve/Reject deep links to admin page.

### Admin UI
- New page `/admin/users` (admin-only) with tabs: Pending Approvals | All Users.
- Columns: Name, Email, Signup Date, Status. Actions: Approve / Reject (with notes) / View Details / Suspend.
- All actions write to `user_audit_log`.

---

## Technical Details

- Stack: existing React + Vite + Tailwind + shadcn + Supabase. No new deps expected beyond date-fns (already in project).
- Week math: `date-fns` `startOfWeek(d, { weekStartsOn: 1 })` and `eachWeekOfInterval` for 2026.
- Visual tokens reuse existing blue-white gradient theme + spiritual styling already in `index.css`.
- All new tables include explicit GRANTs and RLS per platform rules.
- Substack source: I'll use the publication RSS feed (no auth needed) unless you tell me the Substack API endpoint to hit with `SUBSTACK_API_KEY`.

---

## Open Questions

1. **Phase priority** — do you want all 4 phases now, or start with Phase 1 + Phase 2 (tracker) and defer comments/approval?
2. **Substack publication URL** — what's the URL of the Satsang Substack (e.g. `https://yourname.substack.com`)?
3. **LifeQuest source** — is LifeQuest also on Substack, or manual entry only?
4. **YouTube channel** — should I pull from a YouTube channel ID via API later (would need `YOUTUBE_API_KEY`), or manual entry only for now?
5. **Admin approval** — okay to retroactively mark all existing users as `approved` so no one is locked out?
