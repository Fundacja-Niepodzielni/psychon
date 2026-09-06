import type { Metadata } from "next";
import SupervisionSlots from "@/components/h12/SupervisionSlots";

export const metadata: Metadata = {
  title: "Superwizja — Niepodzielni",
};

export default function SupervisionPage() {
  return <SupervisionSlots />;
}
