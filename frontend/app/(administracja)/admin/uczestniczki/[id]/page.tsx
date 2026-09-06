"use client";

import { use } from "react";
import AdminUserCard from "@/components/h18/AdminUserCard";

/**
 * Karta osoby (H18). Komponent kliencki (token w `localStorage`), więc
 * `params` przychodzi jako `Promise` i rozpakowujemy je `use()` — konwencja
 * Next 16 (dynamic-routes).
 */
export default function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <AdminUserCard id={Number(id)} />;
}
