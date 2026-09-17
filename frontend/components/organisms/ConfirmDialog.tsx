"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import Button from "@/components/ui/Button";

export interface ConfirmDialogProps {
  /** Czy okno jest otwarte — sterowane przez wołający ekran. */
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Waga przycisku potwierdzenia; "secondary" dla akcji, która nie powinna
   * wyglądać jak zachęta (np. usunięcie czegoś). */
  confirmVariant?: "primary" | "secondary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
  /** Dodatkowa treść między opisem a przyciskami — np. pole formularza,
   * którego okno samo nie modeluje (rola, powód). Klocek jej nie waliduje
   * ani nie opisuje przez `aria-describedby` — to zadanie treści, którą tu
   * wstawia wołający ekran (własne etykiety, własne komunikaty błędów). */
  children?: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * `ConfirmDialog` — organizm C2 wariant C: okno potwierdzenia z pułapką
 * fokusu. Powtarza wzorzec zachowania trzech okien z
 * `components/h03/ApplicationsTab.tsx` (fokus wchodzi do okna, `Escape`
 * zamyka, fokus wraca do elementu, który okno otworzył) jako jeden
 * komponent wielokrotnego użytku (Z-9, Z-12). Warstwa `z-50` — ta sama
 * warstwa co istniejące okna; nazwana skala — do wprowadzenia dla
 * wszystkich naraz.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Potwierdź",
  cancelLabel = "Anuluj",
  confirmVariant = "primary",
  loading = false,
  onConfirm,
  onCancel,
  className = "",
  children,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Fokus wchodzi do okna przy otwarciu; po zamknięciu wraca do elementu,
  // który okno otworzyło (Z-9, Z-12).
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement;
      dialogRef.current?.focus();
    } else if (openerRef.current instanceof HTMLElement) {
      openerRef.current.focus();
      openerRef.current = null;
    }
  }, [open]);

  // Przejście w stan zapisu blokuje przycisk potwierdzenia (`disabled`).
  // Gdy przeglądarka blokuje aktywny przycisk, zdejmuje z niego fokus "w
  // donikąd" — leci zdarzenie `focusout` z `relatedTarget === null` (nowego
  // celu nie ma; `focusin` w tym przypadku w ogóle nie leci, bo `<body>` nie
  // przejmuje fokusu jak zwykły element). Nasłuch łapie tę chwilę i odsyła
  // fokus do kontenera okna — obojętnie, czy zatwierdzenie przyszło z
  // klawiatury, czy myszą. Aktywny wyłącznie w stanie zapisu: poza nim
  // `relatedTarget === null` zdarza się też przy zwykłym wyjściu z karty
  // (np. Alt+Tab), a bez tego zawężenia nasłuch łapał taką chwilę tak samo,
  // jakby zapis trwał, i przenosił fokus na kontener bez powodu. Kliknięcie
  // samego "Usuń" ma osobne, natychmiastowe zabezpieczenie niżej (przy
  // przycisku) — ten nasłuch łapie pozostałe sposoby, którymi zapis mógłby
  // się zacząć (np. zatwierdzenie formularza z zewnątrz).
  useEffect(() => {
    if (!open || !loading) return;
    function handleFocusOut(event: FocusEvent) {
      const container = dialogRef.current;
      if (!container) return;
      const next = event.relatedTarget;
      if (next === null || (next instanceof Node && !container.contains(next))) {
        container.focus();
      }
    }
    document.addEventListener("focusout", handleFocusOut);
    return () => document.removeEventListener("focusout", handleFocusOut);
  }, [open, loading]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Blok Escape — osobno od pułapki fokusu niżej, żeby dało się go
    // wyłączyć samego przy kontroli negatywnej, bez ruszania Tab. Zablokowane
    // razem z "Anuluj", żeby nie dało się przerwać trwającego zapisu.
    if (event.key === "Escape") {
      event.stopPropagation();
      if (!loading) onCancel();
      return;
    }

    if (event.key !== "Tab") return;
    const container = dialogRef.current;
    if (!container) return;
    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    // Zaraz po otwarciu aktywny jest kontener (fokus programowy w efekcie
    // wyżej), nie `first` — pułapka musi więc reagować na kontener tak samo
    // jak na skrajne elementy, inaczej pierwszy Shift+Tab ucieka pod tło.
    const beforeFirst = active === container || active === first;
    const afterLast = active === container || active === last;

    if (event.shiftKey && beforeFirst) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && afterLast) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      // Klik w tło nie zamyka okna (samo "Anuluj" i Escape zamykają) i nie
      // może przenieść fokusu pod spód: domyślne zachowanie przeglądarki po
      // mousedown na elemencie bez fokusu to zdjęcie fokusu na `document.body`,
      // więc blokujemy je tu, zanim do tego dojdzie. Warunek celu zdarzenia
      // ogranicza blokadę do samego tła — mousedown, który zaczyna się w
      // treści okna (np. przeciągnięcie zaznaczające tekst), przechodzi bez
      // przeszkód.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
        className={`w-full max-w-md rounded-md border border-line bg-card p-6 shadow-card focus-visible:focus-ring ${className}`}
      >
        <h2 id={titleId} className="text-h3 font-black text-ink">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-2 text-body text-muted">
            {description}
          </p>
        )}
        {children}
        {/* Region ogłoszeń dla czytnika ekranu: węzeł zostaje w drzewie przez
         * cały czas, gdy okno jest otwarte, a tekst pojawia się i znika wraz
         * ze stanem zapisu — inaczej nowo domontowany region nie zawsze
         * zdąży trafić do drzewa dostępności, zanim ogłoszenie ma polecieć. */}
        <span role="status" className="sr-only">
          {loading ? "Trwa zapisywanie." : ""}
        </span>
        <div className="mt-5 flex gap-3">
          <Button
            variant={confirmVariant}
            loading={loading}
            onClick={() => {
              // Ten klik może natychmiast zablokować ten sam przycisk
              // (przejście w stan zapisu) — przeglądarka wtedy zabiera z
              // niego fokus "donikąd" zanim React (i nasłuch wyżej) zdąży
              // cokolwiek zareagować, bo blokada i odsyłanie fokusu dzieją
              // się synchronicznie w tym samym przebiegu, w którym dopiero
              // ustawia się stan zapisu. Przeniesienie fokusu na kontener
              // tu, przed wywołaniem akcji, usuwa ten wyścig u źródła.
              dialogRef.current?.focus();
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
