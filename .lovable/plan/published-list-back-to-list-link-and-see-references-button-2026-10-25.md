# Published list, back-to-list link, and "See references" button

## 1. Published section on Create / Access Drafts
- Add a new "Published Projects" section between the main list and "Archived Projects".
- Any project in Stg 10 (Published) moves out of the main list into this section automatically.
- Same columns, filters and row actions as the main list, with a count badge. Collapsible like Archived.
- Archived projects stay in Archived even if published.

## 2. "Back to project list" link on Edit and Refine
- Add a "Back to Drafts list" button at the start of the action bar (next to Tracker).
- It opens Create / Access Drafts, scrolls to this project's row and briefly highlights it (in whichever section it sits: main, Published or Archived), clearing filters that would hide it.

## 3. "See references" button
- Remove the left "Bring ideas and create first draft" back link from the top banner on Edit and Refine.
- Add a "See references" button in the action bar right next to "Assign", opening the Reference Intake page for this project.

## Technical details
- `ProjectsTable.tsx`: split `activeProjects` into non-published and `publishedProjects` using `getDraftStage(metadata, status) === "s9_published"`; render a third table reusing `renderProjectRow`. Read `?project=<id>` from search params, reset filters, `scrollIntoView` the row (`id="project-row-<id>"`) and apply a temporary highlight class.
- `Workspace.tsx`: drop `leftLabel/leftPath` from `PageNavigationBanner` (verify the banner handles missing left link); add buttons `navigate('/dashboard?project=<id>')` and `navigate('/project/<id>/intake')` in the top bar.
