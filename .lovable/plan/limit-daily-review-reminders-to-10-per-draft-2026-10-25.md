## Limit daily review reminders to 10 per draft

### What changes
- Each draft waiting for Concept Review (Stg 3) or Peer Review (Stg 6) gets **at most 10 daily reminder emails** for that stage.
- After the 10th reminder, emails stop for that draft. Nothing else changes: the draft stays in its stage.
- If a draft leaves the stage and comes back later (for example, after a redo), the count starts again from zero.
- **Existing drafts:** if 10 or more days have passed since the first reminder (or since the draft entered the stage, when no reminder was recorded), reminders stop now.

### Technical details
- In `notify-pending-reviews`, keep a counter on each project in `metadata.review_reminders = { stage, count, first_sent_at }`.
  - Stage differs from the stored stage: reset to `{ stage, count: 0, first_sent_at: null }`.
  - Skip sending if `count >= 10`, or if `first_sent_at` is 10 or more days old.
  - After a successful send: increase `count` and set `first_sent_at` if it's empty. Save with the service role.
- Backfill for existing drafts: when there's no counter, use the time the draft entered the stage (the stage-change timestamp in metadata, if there is one) as `first_sent_at`. If that's 10 or more days old, set `count = 10` so reminders stop.
- Return the number of skipped drafts in the response so we can check it.
