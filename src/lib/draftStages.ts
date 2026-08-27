// Shared draft stage definitions used by the workspace workflow and the projects table.
export type DraftStage =
  | "s1_preparing"
  | "s2_submit_concept"
  | "s3_awaiting_concept"
  | "s4_concept_approved"
  | "s5_submit_peer"
  | "s6_awaiting_peer"
  | "s7_peer_done"
  | "s7_awaiting_final"
  | "s8_ready"
  | "s9_published";

export const DRAFT_STAGES: { value: DraftStage; label: string; short: string }[] = [
  { value: "s1_preparing", label: "Stg 1. Preparing first draft", short: "Stg 1" },
  { value: "s2_submit_concept", label: "Stg 2. Submit for Concept Review", short: "Stg 2" },
  { value: "s3_awaiting_concept", label: "Stg 3. Awaiting Concept Review", short: "Stg 3" },
  { value: "s4_concept_approved", label: "Stg 4. Concept Approved, Refinements in Progress", short: "Stg 4" },
  { value: "s5_submit_peer", label: "Stg 5. Submit for Peer Review", short: "Stg 5" },
  { value: "s6_awaiting_peer", label: "Stg 6. Awaiting Peer Review", short: "Stg 6" },
  { value: "s7_peer_done", label: "Stg 7. Peer Review done, Refinements In Progress", short: "Stg 7" },
  { value: "s7_awaiting_final", label: "Stg 8. Send Draft and Review Comments for Final Go Ahead", short: "Stg 8" },
  { value: "s8_ready", label: "Stg 9. Ready to move to Publishing Channel", short: "Stg 9" },
  { value: "s9_published", label: "Stg 10. Published", short: "Stg 10" },
];

export const LEGACY_STAGE_MAP: Record<string, DraftStage> = {
  preparing: "s1_preparing",
  concept_review: "s3_awaiting_concept",
  refinements: "s4_concept_approved",
  peer_review: "s6_awaiting_peer",
  ready: "s8_ready",
};

// Derive the stage of a project from its metadata, falling back to project status.
export const getDraftStage = (metadata: any, status?: string): DraftStage => {
  const raw = metadata?.draft_stage as string | undefined;
  if (raw && DRAFT_STAGES.some((s) => s.value === raw)) return raw as DraftStage;
  if (raw && LEGACY_STAGE_MAP[raw]) return LEGACY_STAGE_MAP[raw];
  if (status === "published") return "s9_published";
  if (status === "approved") return "s8_ready";
  if (status === "review") return "s6_awaiting_peer";
  return "s1_preparing";
};

export const stageLabel = (stage: DraftStage) =>
  DRAFT_STAGES.find((s) => s.value === stage)?.label || stage;

export const stageShort = (stage: DraftStage) =>
  DRAFT_STAGES.find((s) => s.value === stage)?.short || stage;
