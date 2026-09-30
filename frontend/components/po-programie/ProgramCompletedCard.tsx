import Card from "@/components/ui/Card";
import Stack from "@/components/ui/Stack";
import Text from "@/components/ui/Text";
import TextLink from "@/components/ui/TextLink";
import type { Role } from "@/lib/home-by-role";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export interface ProgramCompletedCardProps {
  completedAt: string;
  role: Role;
}

/**
 * Stan „program ukończony" ekranu `/panel/po-programie`. Certyfikat
 * jest odnośnikiem tylko dla `volunteer` — `role:volunteer` na
 * `GET /certificate/conditions` (`backend/routes/api/h13.php`,
 * `Route::get('/certificate/conditions'`) odrzuca
 * `student`, więc front nie obiecuje linku, którego serwer i tak nie spełni.
 */
export default function ProgramCompletedCard({
  completedAt,
  role,
}: ProgramCompletedCardProps) {
  return (
    <Card title="Program ukończony">
      <Stack>
        <Text tone="muted">
          Program ukończono {formatDate(completedAt)}. Materiały programu i
          dokumenty zostają dostępne bez ograniczenia czasowego.
        </Text>
        <Stack as="ul" gap="tight">
          <li>
            <TextLink href="/panel/dokumenty">Twoje dokumenty</TextLink>
          </li>
          <li>
            <TextLink href="/panel/kursy">Kursy</TextLink>
          </li>
          {role === "volunteer" && (
            <li>
              <TextLink href="/panel/certyfikat">Certyfikat</TextLink>
            </li>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
