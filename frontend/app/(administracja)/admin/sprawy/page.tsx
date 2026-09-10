import type { Metadata } from "next";
import AdminSupervisionCases from "@/components/h12/AdminSupervisionCases";

export const metadata: Metadata = {
  title: "Sprawy — Niepodzielni",
};

export default function AdminSupervisionCasesPage() {
  return <AdminSupervisionCases />;
}
