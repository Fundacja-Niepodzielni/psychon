"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { CircleHelp, X } from "lucide-react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { ApiError, sendHelpMessage } from "@/lib/api";
import useCloseOnOutsideOrEscape from "@/lib/hooks/useCloseOnOutsideOrEscape";

const MAX_CONTENT_LENGTH = 2000;

function errorFor(
  errors: Record<string, string[]> | undefined,
  field: string,
): string | undefined {
  return errors?.[field]?.[0];
}

/**
 * Okno pomocy — jeden przycisk dostepny z KAZDEGO ekranu zalogowanej strefy.
 * Renderowany w `PanelShell`, wspolnym szkielecie dla panelu uczestnika,
 * prowadzacego i administracji — nie w rejestrze menu roli (`lib/menu/*`),
 * ktorego ten pakiet w ogole nie dotyka.
 *
 * Ekran nadawcy to biezaca sciezka frontu (`usePathname`), nigdy pole
 * wpisywane przez uzytkownika. Rola i identyfikator nadawcy pochodza
 * z tokena po stronie backendu (`POST /help-messages`) — front ich nie zna
 * i nie wysyla.
 *
 * Zaplecze (`POST /help-messages`) jest scalone: `backend/routes/api/pomoc.php`
 * (`->post('/help-messages'`), za flaga `features.help` (domyslnie wlaczona,
 * `config('features.help', true)`), obsluga w
 * `HelpMessageController::store`. Ten plik wola prawdziwa trase przez
 * `sendHelpMessage` (`lib/api/help.ts`) — atrapa w testach
 * (`components/layout/__tests__/help-widget-*.test.tsx`) tylko podmienia
 * fetch w tescie, nie oznacza brakujacego backendu.
 */
export default function HelpWidget() {
  const pathname = usePathname();
  const panelId = useId();
  const contentId = `${panelId}-content`;
  const contentErrorId = `${contentId}-error`;
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>();
  const [reference, setReference] = useState<string | null>(null);

  function closePanel() {
    setOpen(false);
  }

  function openPanel() {
    setOpen(true);
  }

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  useCloseOnOutsideOrEscape(containerRef, open, setOpen);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setFormError(null);
    setFieldErrors(undefined);

    try {
      const result = await sendHelpMessage({
        content,
        screen: pathname || "/",
      });
      setReference(result.reference);
      setContent("");
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 422) {
        setFieldErrors(error.errors);
        setFormError("Popraw zaznaczone pole.");
      } else if (error instanceof ApiError && error.status === 401) {
        setFormError(
          "Sesja wygasła. Zaloguj się ponownie, aby wysłać zgłoszenie.",
        );
      } else {
        setFormError(
          "Nie udało się wysłać zgłoszenia. Sprawdź połączenie i spróbuj ponownie.",
        );
      }
      // Tresc pozostaje wpisana — nadawca nie pisze zgloszenia od nowa po bledzie.
    } finally {
      setSending(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Pomoc"
        className="relative flex size-11 items-center justify-center rounded-pill text-icon transition-colors duration-150 hover:bg-nav-hover hover:text-nav-hover-ink focus-visible:focus-ring"
      >
        <CircleHelp aria-hidden="true" className="size-5" />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Zgłoś pytanie do pomocy"
          className="absolute right-0 top-12 z-dropdown w-[22rem] max-w-[90vw] rounded-card border border-line bg-card p-4 shadow-card"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-small font-bold text-ink">Potrzebujesz pomocy?</p>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Zamknij okno pomocy"
              className="flex size-8 items-center justify-center rounded-pill text-icon transition-colors duration-150 hover:bg-nav-hover hover:text-nav-hover-ink focus-visible:focus-ring"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>

          {reference ? (
            <Alert variant="success" className="mt-3">
              Zgłoszenie wysłane, numer {reference}.
            </Alert>
          ) : (
            <form className="mt-3 flex flex-col gap-3" onSubmit={handleSubmit}>
              {formError && <Alert variant="error">{formError}</Alert>}

              <div>
                <label
                  htmlFor={contentId}
                  className="mb-1 block text-small font-medium text-ink"
                >
                  Opisz, w czym możemy pomóc
                </label>
                <textarea
                  ref={textareaRef}
                  id={contentId}
                  required
                  rows={4}
                  maxLength={MAX_CONTENT_LENGTH}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  aria-invalid={errorFor(fieldErrors, "content") ? true : undefined}
                  aria-describedby={
                    errorFor(fieldErrors, "content") ? contentErrorId : undefined
                  }
                  className="w-full rounded-sm border border-line bg-card px-4 py-2.5 text-body text-ink transition-colors duration-200 focus-visible:focus-ring disabled:opacity-50"
                />
                {errorFor(fieldErrors, "content") && (
                  <p id={contentErrorId} className="mt-1 text-caption text-danger">
                    {errorFor(fieldErrors, "content")}
                  </p>
                )}
              </div>

              <Button type="submit" loading={sending}>
                Wyślij zgłoszenie
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
