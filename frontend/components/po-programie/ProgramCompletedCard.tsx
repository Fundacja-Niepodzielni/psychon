import Link from "next/link";
import Card from "@/components/ui/Card";
import type { Role } from "@/lib/home-by-role";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const linkClass = "text-primary underline focus-visible:focus-ring";

export interface ProgramCompletedCardProps {
  completedAt: string;
  role: Role;
}

/**
 * Stan „program ukończony" ekranu `/panel/po-programie` (poz. 8). Certyfikat
 * jest odnośnikiem tylko dla `volunteer` — `role:volunteer` na
 * `GET /certificate/conditions` (`backend/routes/api/h13.php:26`) odrzuca
 * `student`, więc front nie obiecuje linku, którego serwer i tak nie spełni.
 */
export default function ProgramCompletedCard({
  completedAt,
  role,
}: ProgramCompletedCardProps) {
  return (
    <Card title="Program ukończony">
      <p className="text-body text-muted">
        Program ukończono {formatDate(completedAt)}. Materiały programu i
        dokumenty zostają dostępne bez ograniczenia czasowego.
      </p>
      <ul className="mt-4 flex flex-col gap-2 text-body text-ink">
        <li>
          <Link href="/panel/dokumenty" className={linkClass}>
            Twoje dokumenty
          </Link>
        </li>
        <li>
          <Link href="/panel/kursy" className={linkClass}>
            Kursy
          </Link>
        </li>
        {role === "volunteer" && (
          <li>
            <Link href="/panel/certyfikat" className={linkClass}>
              Certyfikat
            </Link>
          </li>
        )}
      </ul>
    </Card>
  );
}
