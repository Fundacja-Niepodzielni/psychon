import type { Metadata } from "next";
import AdminReliability from "@/components/h07/AdminReliability";

export const metadata: Metadata = {
  title: "Czas nauki — Niepodzielni",
};

export default function LearningTimePage() {
  return <AdminReliability />;
}
