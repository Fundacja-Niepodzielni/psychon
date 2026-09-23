"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEGAL_DOCUMENT_LABELS, LEGAL_DOCUMENT_TYPES } from "@/lib/h22/legal-documents";

/** Powłoki, które mają już własną stopkę z odnośnikiem do deklaracji (`PanelShell`). */
const POWLOKI_Z_WLASNA_STOPKA = ["/admin", "/panel", "/prowadzacy"];

const stylOdnosnika =
  "inline-flex min-h-control items-center text-small font-medium text-muted underline underline-offset-2 hover:text-ink focus-visible:focus-ring";

/**
 * Stopka z odnośnikiem do deklaracji dostępności i dokumentów prawnych —
 * dla ekranów publicznych poza powłoką paneli.
 * Ekrany pod `/admin`, `/panel` i `/prowadzacy` mają już identyczną stopkę
 * w `PanelShell`, więc tu ich nie dublujemy. Sama `/deklaracja-dostepnosci`
 * też nie potrzebuje odnośnika do siebie.
 */
export default function PublicFooter() {
  const pathname = usePathname();
  const maWlasnaStopke = POWLOKI_Z_WLASNA_STOPKA.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (maWlasnaStopke || pathname === "/deklaracja-dostepnosci") return null;

  return (
    <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line bg-card px-4 py-2 sm:px-6">
      <Link href="/deklaracja-dostepnosci" className={stylOdnosnika}>
        Deklaracja dostępności
      </Link>
      {LEGAL_DOCUMENT_TYPES.map((typ) => (
        <Link key={typ} href={`/dokumenty-prawne/${typ}`} className={stylOdnosnika}>
          {LEGAL_DOCUMENT_LABELS[typ]}
        </Link>
      ))}
    </footer>
  );
}
