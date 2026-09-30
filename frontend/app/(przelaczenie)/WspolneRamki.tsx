"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import HelpWidget from "@/components/layout/HelpWidget";
import NotificationBell from "@/components/notifications/NotificationBell";
import { endSession } from "@/lib/api";
import { LEGAL_DOCUMENT_LABELS, LEGAL_DOCUMENT_TYPES } from "@/lib/h22/legal-documents";

/**
 * Części wspólne nowych ramek uczestnika i prowadzącego (szablon
 * `PowlokaPanelu`): to samo wylogowanie, te same narzędzia paska i te same
 * łącza stopki co w ramce administracji i dotychczasowej powłoce.
 */

/** Wylogowanie w tej samej kolejności co dotychczasowa powłoka: adres SSO przed końcem sesji. */
export function useWylogowanieRamki() {
  const router = useRouter();
  const [wylogowywanie, setWylogowywanie] = useState(false);

  async function wyloguj() {
    setWylogowywanie(true);
    try {
      const res = await fetch("/api/auth/end-session-url");
      const { url } = (await res.json()) as { url: string };
      await endSession();
      window.location.assign(url);
    } catch {
      await endSession();
      setWylogowywanie(false);
      router.push("/logowanie");
    }
  }

  return { wyloguj, wylogowywanie };
}

/** Narzędzia górnego paska: pomoc i powiadomienia. */
export function NarzedziaPaskaRamki() {
  return (
    <>
      <HelpWidget />
      <NotificationBell />
    </>
  );
}

/** Łącza stopki menu: deklaracja dostępności i dokumenty prawne. */
export function StopkaRamki() {
  return (
    <>
      <Link href="/deklaracja-dostepnosci">Deklaracja dostępności</Link>
      {LEGAL_DOCUMENT_TYPES.map((typ) => (
        <Link key={typ} href={`/dokumenty-prawne/${typ}`}>
          {LEGAL_DOCUMENT_LABELS[typ]}
        </Link>
      ))}
    </>
  );
}
