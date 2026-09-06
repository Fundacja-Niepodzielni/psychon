import type { Metadata } from "next";
import AuditLogView from "@/components/h20/AuditLogView";

export const metadata: Metadata = {
  title: "Dziennik działań — Niepodzielni",
};

export default function AdminAuditLogPage() {
  return <AuditLogView />;
}
