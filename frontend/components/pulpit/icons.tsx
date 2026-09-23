import type { CourseStatus } from "@/lib/courses";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Ikony                                                             */
/* ------------------------------------------------------------------ */

export function iconProps(size = "size-5") {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: size,
    "aria-hidden": true,
  };
}

export function statusIcon(status: CourseStatus): ReactNode {
  if (status === "completed") {
    return (
      <svg {...iconProps()}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (status === "in_progress") {
    return (
      <svg {...iconProps()}>
        <path d="m7 4 13 8-13 8V4z" />
      </svg>
    );
  }
  return <LockIcon />;
}

export function LockIcon() {
  return (
    <svg {...iconProps("size-4 shrink-0")}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
