"use client";

import { use } from "react";
import AdminProfileDetail from "@/components/h15/AdminProfileDetail";

/**
 * Komponent kliencki (token w `localStorage`), więc `params` przychodzi jako
 * Promise (Next.js 16) — odpakowujemy przez `use()`.
 */
export default function AdminProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return <AdminProfileDetail id={Number(id)} />;
}
