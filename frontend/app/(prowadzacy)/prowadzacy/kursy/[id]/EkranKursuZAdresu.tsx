"use client";

import { use } from "react";
import { KursAdministracji } from "@/nowy-front/kurs-administracji/KursAdministracji";

/** Ekran kursu w roli prowadzącego z identyfikatorem kursu z adresu. */
export function EkranKursuZAdresu({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return <KursAdministracji idKursu={id} rola="instructor" />;
}
