import type { Metadata } from "next";
import Card from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Dostęp wygasł — Niepodzielni",
};

export default function AccessExpiredPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <Card className="w-full max-w-xl text-center">
        <p className="text-caption font-bold uppercase tracking-wide text-subtle">
          Konto nieaktywne
        </p>
        <h1 className="mt-1 text-h3 font-bold text-ink">
          Twój dostęp do platformy wygasł
        </h1>
        <p className="mt-3 text-body text-muted">
          Sześciomiesięczny okres dostępu do programu dobiegł końca. Jeśli
          chcesz dokończyć program albo uważasz, że to pomyłka — napisz do nas,
          a przedłużymy Twój dostęp.
        </p>
        <p className="mt-4 text-body font-medium text-ink">
          Kontakt:{" "}
          <a
            href="mailto:kontakt@niepodzielni.pl"
            className="text-accent underline underline-offset-2 hover:text-accent-dark focus-visible:focus-ring"
          >
            kontakt@niepodzielni.pl
          </a>
        </p>
      </Card>
    </div>
  );
}
