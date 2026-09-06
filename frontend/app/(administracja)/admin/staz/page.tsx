import type { Metadata } from "next";
import AdminInternshipQueue from "@/components/h11/AdminInternshipQueue";

export const metadata: Metadata = {
  title: "Akceptacja stażu — Niepodzielni",
};

export default function AdminInternshipPage() {
  return <AdminInternshipQueue />;
}
