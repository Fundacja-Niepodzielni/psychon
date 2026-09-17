"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Powłoki, które mają już własną stopkę z odnośnikiem do deklaracji (`PanelShell`). */
const POWLOKI_Z_WLASNA_STOPKA = ["/admin", "/panel", "/prowadzacy"];

/**
 * Stopka z odnośnikiem do deklaracji dostępności — dla ekranów publicznych
 * poza powłoką paneli. Ekrany pod `/admin`, `/panel` i `/prowadzacy` mają
 * już identyczną stopkę w `PanelShell`, więc tu ich nie dublujemy.
 * Sama `/deklaracja-dostepnosci` też nie potrzebuje odnośnika do siebie.
 */
export default function PublicFooter() {
  const pathname = usePathname();
  const maWlasnaStopke = POWLOKI_Z_WLASNA_STOPKA.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (maWlasnaStopke || pathname === "/deklaracja-dostepnosci") return null;

  return (
    <footer className="border-t border-line bg-card px-4 py-2 sm:px-6">
      <Link
        href="/deklaracja-dostepnosci"
        className="inline-flex min-h-control items-center text-small font-medium text-muted underline underline-offset-2 hover:text-ink focus-visible:focus-ring"
      >
        Deklaracja dostępności
      </Link>
    </footer>
  );
}
