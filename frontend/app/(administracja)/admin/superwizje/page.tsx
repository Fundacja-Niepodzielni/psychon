import type { Metadata } from "next";
import AdminSupervisionSlots from "@/components/h12/AdminSupervisionSlots";

export const metadata: Metadata = {
  title: "Superwizje — Niepodzielni",
};

export default function AdminSupervisionSlotsPage() {
  return <AdminSupervisionSlots />;
}
