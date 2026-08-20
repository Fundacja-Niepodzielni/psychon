import type { Metadata } from "next";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Start — Niepodzielni",
};

export default function ParticipantStartPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h2 font-black text-ink">Zacznij tutaj</h1>
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-h4 font-bold text-ink">
              Tu powstanie ekran „Zacznij tutaj&rdquo;
            </h2>
            <p className="mt-2 text-body text-muted">
              Ten ekran zbuduje pakiet <strong>H21</strong> (onboarding
              uczestnika). Na razie to strona-placeholder ze startera.
            </p>
          </div>
          <Badge variant="accent">Pakiet H21</Badge>
        </div>
      </Card>
    </div>
  );
}
