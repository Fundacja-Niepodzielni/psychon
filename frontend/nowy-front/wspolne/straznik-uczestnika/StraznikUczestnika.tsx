"use client";

// Tokeny nowego frontu: ekran odmowy stoi też w dotychczasowej ramce panelu, która ich nie ładuje.
import "@/design-system/tokeny/tokeny.css";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, endSession } from "@/lib/api";
import { homeForRole } from "@/lib/home-by-role";
import { EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";
import { KOMUNIKAT_SERWER } from "@/nowy-front/wspolne/komunikaty";
import { PARAMETR_PODGLADU } from "@/nowy-front/wspolne/tryb-podgladu/tryb-podgladu";
import {
  czyAdresZTrybemPodgladu,
  czyPodgladPersonelu,
  maRoleUczestnika,
  roleKonta,
  type KontoZRolami,
} from "./straznik-uczestnika";

/** Rola, dla której są ekrany uczestnika, w zdaniu „Ten ekran jest dla …”. */
export const ROLA_DOCELOWA_UCZESTNIKA = "osób uczestniczących w programie";

/** Napis przycisku odmowy dla konta, którego pulpit leży w panelu uczestnika. */
export const PRZYCISK_WYLOGOWANIA = "Wyloguj się";

/** Napis w czasie odczytu konta. */
export const TEKST_WCZYTYWANIA = "Wczytywanie…";

type Stan =
  | { status: "wczytywanie" }
  | { status: "blad" }
  | { status: "gotowe"; role: string[]; rolaGlowna: string | undefined };

/**
 * Ekrany uczestnika (układy `/panel` i strony podglądu ekranów uczestnika pod `/nowy-front`)
 * pokazują treść osobie z rolą uczestnika (także gdy ma jeszcze inną rolę). Personel i prowadzący
 * widzą kurs, test kursu i lekcję w trybie podglądu (parametr `podglad` o wartości 1). Każda inna
 * osoba widzi wspólny ekran odmowy nowej ramki („Nie masz dostępu do tego ekranu”) z przyciskiem do
 * pulpitu swojej roli (albo z wylogowaniem, gdy ten pulpit leży w panelu uczestnika), bez treści ekranu. Konto jest czytane raz (`GET /me`, odpowiedź wspólna
 * z ramką), a adres przy każdej zmianie, bo układ zostaje na miejscu przy przejściach między
 * ekranami panelu.
 */
export function StraznikUczestnika({ children }: { children: ReactNode }) {
  const [stan, setStan] = useState<Stan>({ status: "wczytywanie" });
  const sciezka = usePathname() ?? "";

  useEffect(() => {
    let aktywny = true;
    api<KontoZRolami>("/me")
      .then((konto) => {
        if (!aktywny) return;
        setStan({
          status: "gotowe",
          role: roleKonta(konto),
          rolaGlowna: typeof konto?.role === "string" ? konto.role : undefined,
        });
      })
      .catch((blad: unknown) => {
        if (!aktywny) return;
        // 401 kończy sesję i przenosi na logowanie w kliencie API — ekran zostaje przy wczytywaniu.
        if (blad instanceof ApiError && blad.status === 401) return;
        // 403 na odczycie konta: konto bez ról, ten sam ekran odmowy.
        if (blad instanceof ApiError && blad.status === 403) {
          setStan({ status: "gotowe", role: [], rolaGlowna: undefined });
          return;
        }
        setStan({ status: "blad" });
      });
    return () => {
      aktywny = false;
    };
  }, []);

  if (stan.status === "wczytywanie") {
    return (
      <p role="status" style={{ padding: "var(--space-24)" }}>
        {TEKST_WCZYTYWANIA}
      </p>
    );
  }

  if (stan.status === "blad") {
    return (
      <p role="alert" style={{ padding: "var(--space-24)" }}>
        {KOMUNIKAT_SERWER}
      </p>
    );
  }

  if (maRoleUczestnika(stan.role)) return <>{children}</>;

  const odmowa = <OdmowaUczestnika rolaGlowna={stan.rolaGlowna} />;
  if (!czyAdresZTrybemPodgladu(sciezka)) return odmowa;

  return (
    <Suspense fallback={odmowa}>
      <PodgladPersonelu role={stan.role} sciezka={sciezka} odmowa={odmowa}>
        {children}
      </PodgladPersonelu>
    </Suspense>
  );
}

/** Ekran kursu, testu albo lekcji: treść w trybie podglądu personelu, inaczej ekran odmowy. */
function PodgladPersonelu({
  role,
  sciezka,
  odmowa,
  children,
}: {
  role: string[];
  sciezka: string;
  odmowa: ReactNode;
  children: ReactNode;
}) {
  const parametr = useSearchParams()?.get(PARAMETR_PODGLADU) ?? null;
  return <>{czyPodgladPersonelu(role, sciezka, parametr) ? children : odmowa}</>;
}

/**
 * Wspólny ekran odmowy nowej ramki. Przycisk prowadzi do pulpitu roli zalogowanej osoby; gdy ten pulpit
 * sam leży w panelu uczestnika (rola spoza słownika albo jej brak), przycisk zamiast tego wylogowuje,
 * tak jak strony logowania dla konta bez miejsca na platformie.
 */
function OdmowaUczestnika({ rolaGlowna }: { rolaGlowna: string | undefined }) {
  const router = useRouter();
  const cel = homeForRole(rolaGlowna);
  const celWPanelu = cel === "/panel" || cel.startsWith("/panel/");

  async function wyloguj() {
    try {
      const odpowiedz = await fetch("/api/auth/end-session-url");
      const { url } = (await odpowiedz.json()) as { url: string };
      await endSession();
      window.location.assign(url);
    } catch {
      await endSession();
      router.push("/logowanie");
    }
  }

  return (
    <div data-theme="light" style={{ padding: "var(--space-24)" }}>
      <EkranOdmowy
        rodzaj="brak-dostepu"
        rolaDocelowa={ROLA_DOCELOWA_UCZESTNIKA}
        przycisk={
          celWPanelu
            ? { etykieta: PRZYCISK_WYLOGOWANIA, onClick: () => void wyloguj() }
            : { onClick: () => router.push(cel) }
        }
      />
    </div>
  );
}
