import type { Metadata } from "next";
import ReportView from "@/components/h20/ReportView";

export const metadata: Metadata = {
  title: "Raport edycji — Niepodzielni",
};

export default function AdminReportPage() {
  return <ReportView />;
}
