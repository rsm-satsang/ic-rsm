// Centralized date/time formatting — the whole app displays EST (America/New_York).
const TZ = "America/New_York";

const toDate = (value: string | number | Date | null | undefined): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  // Bare date strings (YYYY-MM-DD) are treated as calendar dates, not instants.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00Z`);
  }
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

/** e.g. "27 Aug 2026 EST" */
export const formatDate = (value: string | number | Date | null | undefined): string => {
  const d = toDate(value);
  if (!d) return "—";
  return `${d.toLocaleDateString("en-US", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" })} EST`;
};

/** e.g. "Aug 27, 2026, 9:11 AM EST" */
export const formatDateTime = (value: string | number | Date | null | undefined): string => {
  const d = toDate(value);
  if (!d) return "—";
  return `${d.toLocaleString("en-US", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} EST`;
};

/** Short form without year, e.g. "Aug 27 EST" */
export const formatDateShort = (value: string | number | Date | null | undefined): string => {
  const d = toDate(value);
  if (!d) return "—";
  return `${d.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" })} EST`;
};

export const EST_TZ = TZ;
