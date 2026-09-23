import type { CourseStatus } from "@/lib/courses";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Mapa rozwoju — wspólna powłoka węzła                              */
/* ------------------------------------------------------------------ */

export const NODE_TONE: Record<CourseStatus | "supervision", string> = {
  completed: "bg-success-bg text-success",
  // text-accent na bg-accent-15 dawało 4,37:1 (< 4,5:1) —
  // accent-dark to ten sam odcień, ciemniejszy (jak components/ui/Badge.tsx).
  in_progress: "bg-accent-15 text-accent-dark",
  locked: "bg-grey text-subtle",
  supervision: "bg-info-bg text-info-dark",
};

export function NodeShell({
  tone,
  icon,
  showConnector,
  children,
}: {
  tone: string;
  icon: ReactNode;
  showConnector: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span
          aria-hidden="true"
          className={`flex size-9 shrink-0 items-center justify-center rounded-pill ${tone}`}
        >
          {icon}
        </span>
        {showConnector && (
          <span aria-hidden="true" className="mt-1 w-px flex-1 bg-line" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 pb-8">{children}</div>
    </li>
  );
}
