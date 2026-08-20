import type { Metadata } from "next";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Panel prowadzącego — Niepodzielni",
};

export default function InstructorHomePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h2 font-black text-ink">Panel prowadzącego</h1>
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-h4 font-bold text-ink">
              Tu powstaną ekrany prowadzącego
            </h2>
            <p className="mt-2 text-body text-muted">
              Widoki prowadzącego dostarczą pakiety <strong>H12</strong>{" "}
              (superwizje — obecności) i <strong>H17</strong> (pytania i
              odpowiedzi). Na razie to strona-placeholder ze startera.
            </p>
          </div>
          <Badge variant="info">Pakiety H12 / H17</Badge>
        </div>
      </Card>
    </div>
  );
}
