"use client";

import { useState, type FormEvent } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { ApiError, resetTestAttempts } from "@/lib/api";
import type {
  AdminUserCardSlot,
  AdminUserCardSlotProps,
} from "@/lib/slots/admin-user-card";

/** Odmiana „podejście" wg liczby — 1, 2-4 (poza 12-14) i reszta mają różną formę. */
function podejsciaLabel(n: number): string {
  if (n === 1) return "podejście";
  const dziesiatki = n % 10;
  const setki = n % 100;
  if (dziesiatki >= 2 && dziesiatki <= 4 && !(setki >= 12 && setki <= 14)) {
    return "podejścia";
  }
  return "podejść";
}

type Stan =
  | { rodzaj: "gotowe" }
  | { rodzaj: "sukces"; cleared: number; attemptsLimit: number }
  | { rodzaj: "odmowa"; message: string }
  | { rodzaj: "nieznany" };

/**
 * Reset limitu podejść do testu z karty osoby (H10 ·
 * POST /admin/tests/{test}/users/{user}/reset-attempts) — region
 * „user-actions" karty osoby, której właścicielem jest H18.
 *
 * Karta osoby nie zna testów danej osoby (`AdminUserCardResource` ich nie
 * wystawia), więc identyfikator testu wpisuje opiekun ręcznie — tak jak dziś
 * odnajduje go w adresie banku pytań tego testu. Powód jest obowiązkowy:
 * przycisk nie wysyła żądania, dopóki pole jest puste — backend i tak by je
 * odrzucił (422), ale ekran nie czeka na odmowę, żeby powiedzieć to, co już wie.
 *
 * Nierozstrzygnięta odpowiedź (sieć padła, zanim serwer się wypowiedział) NIE
 * jest tym samym, co odmowa: serwer mógł zdążyć wyczyścić podejścia, zanim
 * odpowiedź zgubiła się w drodze. Ekran mówi wtedy wprost, że nie wie, i każe
 * sprawdzić stan zamiast ponawiać w ciemno.
 */
export function ResetAttemptsPanel({ userId }: AdminUserCardSlotProps) {
  const [testId, setTestId] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [stan, setStan] = useState<Stan>({ rodzaj: "gotowe" });

  const testIdNumber = Number(testId);
  const testIdValid =
    testId.trim() !== "" && Number.isInteger(testIdNumber) && testIdNumber > 0;
  const reasonValid = reason.trim() !== "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!testIdValid || !reasonValid) return;

    setSending(true);
    setStan({ rodzaj: "gotowe" });

    try {
      const result = await resetTestAttempts(testIdNumber, userId, reason.trim());
      setStan({
        rodzaj: "sukces",
        cleared: result.cleared,
        attemptsLimit: result.attempts_limit,
      });
      setReason("");
    } catch (err) {
      if (err instanceof ApiError) {
        setStan({ rodzaj: "odmowa", message: err.message });
      } else {
        setStan({ rodzaj: "nieznany" });
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Card title="Reset limitu podejść">
      <p className="mb-4 text-small text-muted">
        Czyści dotychczasowe podejścia tej osoby do wskazanego testu — nowe
        podejście zaczyna numerację od 1. Powód trafia do dziennika audytu.
      </p>

      {stan.rodzaj === "sukces" && (
        <p role="status" className="mb-4 text-small font-medium text-ink">
          Wyczyszczono {stan.cleared} {podejsciaLabel(stan.cleared)} — limit
          tej osoby do tego testu to teraz {stan.attemptsLimit}.
        </p>
      )}
      {stan.rodzaj === "odmowa" && <Alert variant="error">{stan.message}</Alert>}
      {stan.rodzaj === "nieznany" && (
        <Alert variant="info">
          Nie wiemy, czy reset się wykonał — odpowiedź serwera nie dotarła.
          Odśwież kartę osoby i sprawdź stan podejść, zanim spróbujesz ponownie.
        </Alert>
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <Input
          label="Identyfikator testu"
          type="number"
          min={1}
          value={testId}
          onChange={(e) => setTestId(e.target.value)}
          hint="Ten sam numer, co w adresie banku pytań tego testu."
        />
        <Input
          label="Powód resetu"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="Trafia do dziennika audytu."
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="secondary"
            loading={sending}
            disabled={!testIdValid || !reasonValid}
          >
            Zresetuj limit podejść
          </Button>
        </div>
      </form>
    </Card>
  );
}

const slot: AdminUserCardSlot = {
  id: "h10-reset-attempts",
  region: "user-actions",
  order: 200,
  Component: ResetAttemptsPanel,
};

export default slot;
