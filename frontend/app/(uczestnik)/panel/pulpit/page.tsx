import type { Metadata } from "next";
import PulpitDashboard from "@/components/pulpit/PulpitDashboard";

export const metadata: Metadata = {
  title: "Pulpit — Niepodzielni",
};

/**
 * Pulpit uczestnika (`/panel/pulpit`) — pozycja menu tuż po „Start".
 * Cała logika po stronie klienta (token Bearer w `localStorage`).
 */
export default function PulpitPage() {
  return <PulpitDashboard />;
}
