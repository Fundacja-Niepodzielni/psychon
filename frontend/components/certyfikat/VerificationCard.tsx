import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";

export interface VerifyResult {
  number: string;
  status: "valid" | "revoked";
  edition: string;
  issued_at: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Wynik publicznej weryfikacji certyfikatu — wspólny dla /weryfikacja i /certyfikat. */
export default function VerificationCard({ result }: { result: VerifyResult }) {
  const valid = result.status === "valid";

  return (
    <Card warm={!valid}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-caption font-bold uppercase tracking-wide text-subtle">
            Certyfikat
          </p>
          <p className="text-h3 font-black text-ink">{result.number}</p>
        </div>
        <Badge variant={valid ? "success" : "danger"}>
          {valid ? "Ważny" : "Unieważniony"}
        </Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-small">
        <div>
          <dt className="text-subtle">Edycja</dt>
          <dd className="font-bold text-ink">{result.edition}</dd>
        </div>
        <div>
          <dt className="text-subtle">Data wydania</dt>
          <dd className="font-bold text-ink">{formatDate(result.issued_at)}</dd>
        </div>
      </dl>
    </Card>
  );
}
