import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import Card from "@/components/ui/Card";
import Logo from "@/components/ui/Logo";

export interface AuthTemplateProps {
  /** Nagłówek ekranu (jedyny `h1`). */
  title: string;
  /** Jedno zdanie pod nagłówkiem: czym jest ten ekran i co zrobić. */
  description?: string;
  /**
   * Zdanie stanu oczekiwania (np. trwa przekierowanie). Pokazane jako
   * komunikat stanu z ikoną ładowania, zamiast treści z `children`.
   */
  waitingLabel?: string;
  children?: ReactNode;
}

/**
 * `AuthTemplate` — szablon ekranów wejścia (logowanie i pokrewne): znak
 * Fundacji i jedna kolumna na środku, szerokości `max-w-md`. Treść stoi
 * w pionie i zajmuje całą szerokość kolumny, więc przycisk nie potrzebuje
 * własnych klas na stronie.
 */
export default function AuthTemplate({
  title,
  description,
  waitingLabel,
  children,
}: AuthTemplateProps) {
  return (
    <main
      id="tresc"
      className="flex flex-1 flex-col items-center justify-center bg-page px-4 py-10 sm:px-6"
    >
      <div className="flex w-full max-w-md flex-col gap-stack">
        <Logo className="h-10 w-auto self-center" />
        <Card>
          <h1 className="text-title font-bold text-heading">{title}</h1>
          {description && (
            <p className="mt-2 text-body text-muted text-pretty">{description}</p>
          )}
          <div className="mt-6 flex flex-col gap-4">
            {waitingLabel ? (
              <div role="status" className="flex min-h-control items-center gap-3">
                <LoaderCircle
                  aria-hidden="true"
                  className="size-5 shrink-0 animate-spin text-icon motion-reduce:animate-none"
                />
                <p className="text-body text-muted">{waitingLabel}</p>
              </div>
            ) : (
              children
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
