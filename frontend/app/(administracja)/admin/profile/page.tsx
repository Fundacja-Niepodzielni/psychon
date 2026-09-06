import type { Metadata } from "next";
import AdminProfileQueue from "@/components/h15/AdminProfileQueue";

export const metadata: Metadata = { title: "Profile psychologów — Niepodzielni" };

export default function AdminProfileQueuePage() {
  return <AdminProfileQueue />;
}
