import type { Metadata } from "next";
import AdminUsersList from "@/components/h18/AdminUsersList";

export const metadata: Metadata = {
  title: "Uczestniczki i uczestnicy — Niepodzielni",
};

export default function AdminUsersPage() {
  return <AdminUsersList />;
}
