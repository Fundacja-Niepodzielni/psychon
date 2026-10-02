"use client";

import AdminUserCard from "@/components/h18/AdminUserCard";

/**
 * Dotychczasowa treść adresu `/admin/uczestniczki/nowa`: do tej pory adres
 * trafiał do karty osoby z segmentem `nowa` w miejscu identyfikatora, więc
 * przy wyłączonej grupie strona pokazuje dokładnie to samo co wtedy.
 */
export default function NowaOsobaStaraTresc() {
  return <AdminUserCard id={Number("nowa")} />;
}
