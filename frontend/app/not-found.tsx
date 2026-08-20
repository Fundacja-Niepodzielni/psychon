import Link from "next/link";
import Card from "@/components/ui/Card";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <Card className="w-full max-w-xl text-center">
        <p className="text-caption font-bold uppercase tracking-wide text-subtle">
          Błąd 404
        </p>
        <h1 className="mt-1 text-h3 font-bold text-ink">
          Nie znaleziono strony
        </h1>
        <p className="mt-3 text-body text-muted">
          Strona, której szukasz, nie istnieje albo została przeniesiona.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-pill bg-primary px-6 py-2.5 text-body font-medium text-light transition-colors duration-200 hover:bg-ink focus-visible:focus-ring"
        >
          Wróć na stronę główną
        </Link>
      </Card>
    </div>
  );
}
