import type { Metadata } from "next";
import InternshipJournal from "@/components/h11/InternshipJournal";

export const metadata: Metadata = {
  title: "Dziennik stażu — Niepodzielni",
};

export default function InternshipPage() {
  return <InternshipJournal />;
}
