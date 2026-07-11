// Custom-named intake route for "Create Daily Inspiration" projects.
// Reuses the shared IntakePage so behavior stays consistent; the URL and
// the project title (set at creation time) provide the "custom" naming.
import IntakePage from "./IntakePage";
export default function DailyInspirationIntakePage() {
  return <IntakePage />;
}
