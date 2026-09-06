import ApplicationsTab from "@/components/h03/ApplicationsTab";
import type { ApplicationsTabProps } from "@/components/h03/ApplicationsTab";

export type { ApplicationsTabProps };

/** Public descriptor consumed by the H18 participants-screen adapter. */
export const h03ApplicationsTabSlot = {
  id: "h03-applications",
  label: "Zgłoszenia",
  order: 20,
  Component: ApplicationsTab,
} as const;

export default h03ApplicationsTabSlot;
