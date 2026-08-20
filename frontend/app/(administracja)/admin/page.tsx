import type { Metadata } from "next";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Pulpit — Niepodzielni",
};

export default function AdminHomePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h2 font-black text-ink">Pulpit</h1>
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-h4 font-bold text-ink">
              Tu powstanie pulpit administracji
            </h2>
            <p className="mt-2 text-body text-muted">
              Liczniki, kolejki spraw i ustawienia edycji zbuduje pakiet{" "}
              <strong>H19</strong>. Na razie to strona-placeholder ze startera.
            </p>
          </div>
          <Badge variant="accent">Pakiet H19</Badge>
        </div>
      </Card>
    </div>
  );
}
