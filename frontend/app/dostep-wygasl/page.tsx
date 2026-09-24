import type { Metadata } from "next";
import Card from "@/components/ui/Card";
import PublicPageTemplate from "@/components/templates/PublicPageTemplate";

export const metadata: Metadata = {
  title: "Dostęp wygasł — Niepodzielni",
};

export default function AccessExpiredPage() {
  return (
    <PublicPageTemplate naglowek={{ title: "Twój dostęp do platformy wygasł" }}>
      <Card className="w-full max-w-xl text-center">
        <p className="text-caption font-bold uppercase tracking-wide text-subtle">
          Konto nieaktywne
        </p>
        <p className="mt-3 text-body text-muted">
          Sześciomiesięczny okres dostępu do programu dobiegł końca. Jeśli
          chcesz dokończyć program albo uważasz, że to pomyłka — napisz do nas,
          a przedłużymy Twój dostęp.
        </p>
        <p className="mt-4 text-body font-medium text-ink">
          Kontakt:{" "}
          <a
            href="mailto:kontakt@niepodzielni.com"
            className="text-accent underline underline-offset-2 hover:text-accent-dark focus-visible:focus-ring"
          >
            kontakt@niepodzielni.com
          </a>
        </p>
      </Card>
    </PublicPageTemplate>
  );
}
