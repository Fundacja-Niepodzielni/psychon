"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Skeleton } from "@/design-system/atomy/Skeleton/Skeleton";
import { PageHeader } from "@/design-system/organizmy/PageHeader/PageHeader";
import { DataTable, type WierszDataTable } from "@/design-system/organizmy/DataTable/DataTable";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { ApiError } from "@/lib/api/klient";
import { fetchAdminEmailsPage } from "@/lib/api/h16-emails";
import type { MetaSkrzynki, WiadomoscEmail } from "./dane";
import style from "./PowiadomieniaEmail.module.css";

type StanEkranu = "ladowanie" | "brak-uprawnien" | "blad" | "ok";

const ETYKIETY_STATUSU: Record<WiadomoscEmail["status"], string> = {
  queued: "W kolejce",
  sent: "Wysłany",
  failed: "Nieudany",
  simulated: "Symulowany",
};

/**
 * Trasa `/nowy-front/admin/powiadomienia` — zarządzanie powiadomieniami
 * (H16), zbudowane WYŁĄCZNIE wg tras obecnych w `h16.php`. Administracja ma
 * tam dziś jedną trasę tego zasobu — `GET /admin/emails` (odczyt,
 * `EmailController::index`, `backend/routes/api/h16.php:34`); pakiet nie
 * ma trasy zmiany/usunięcia wiadomości ani ponownej wysyłki, więc ten ekran
 * jest przeglądem skrzynki (tabela + stronicowanie), nie formularzem
 * edycji — dopisanie przycisku akcji bez trasy byłoby zmyśleniem API wobec
 * kontraktu HTTP.
 *
 * Odczyt startowy biegnie z przeglądarki (`fetchAdminEmailsPage(1)`) —
 * powód identyczny jak w pozostałych dwóch ekranach administracji: `@/auth`
 * po stronie serwera nie wstaje pod Vitest/jsdom na trasach statycznych.
 *
 * Bez szukajki: `GET /admin/emails` nie ma parametru wyszukiwania — pole
 * filtrujące wyłącznie już pobraną (bieżącą) stronę udawałoby przeszukanie
 * całej skrzynki, którego backend nie robi. `DataTable` (O3) ma `szukajka`
 * opcjonalną właśnie dla takich tras.
 */
export function PowiadomieniaEmail() {
  const router = useRouter();
  const [stan, setStan] = useState<StanEkranu>("ladowanie");
  const [wiadomosci, setWiadomosci] = useState<WiadomoscEmail[]>([]);
  const [meta, setMeta] = useState<MetaSkrzynki | undefined>(undefined);
  const [blad, setBlad] = useState<string | null>(null);
  const [wczytywanie, setWczytywanie] = useState(false);

  useEffect(() => {
    let anulowane = false;
    fetchAdminEmailsPage(1)
      .then((odpowiedz) => {
        if (anulowane) return;
        setWiadomosci(odpowiedz.data);
        setMeta(odpowiedz.meta);
        setStan("ok");
      })
      .catch((wyjatek: unknown) => {
        if (anulowane) return;
        setStan(wyjatek instanceof ApiError && wyjatek.status === 403 ? "brak-uprawnien" : "blad");
      });
    return () => {
      anulowane = true;
    };
  }, []);

  const wierszeTabeli: WierszDataTable[] = useMemo(
    () =>
      wiadomosci.map((wiadomosc) => ({
        id: String(wiadomosc.id),
        wartosci: {
          do_email: wiadomosc.to_email,
          temat: wiadomosc.subject,
          status: ETYKIETY_STATUSU[wiadomosc.status],
          wyslano: wiadomosc.sent_at ?? "—",
        },
      })),
    [wiadomosci],
  );

  async function przejdzNaStrone(strona: number) {
    setWczytywanie(true);
    setBlad(null);
    try {
      const odpowiedz = await fetchAdminEmailsPage(strona);
      setWiadomosci(odpowiedz.data);
      if (odpowiedz.meta) setMeta(odpowiedz.meta);
    } catch {
      setBlad("Nie udało się wczytać kolejnej strony skrzynki. Spróbuj ponownie.");
    } finally {
      setWczytywanie(false);
    }
  }

  if (stan === "ladowanie") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Powiadomienia e-mail</Heading>
        <Skeleton wiersze={4} />
      </main>
    );
  }
  if (stan === "brak-uprawnien") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Powiadomienia e-mail</Heading>
        <Text>Brak uprawnień do tego ekranu — tylko dla opiekuna projektu i super-admina.</Text>
      </main>
    );
  }
  if (stan === "blad") {
    return (
      <main id="tresc" className={style.uklad}>
        <Heading stopien={1}>Powiadomienia e-mail</Heading>
        <Text>Backend H16 nieosiągalny albo zwrócił błąd — spróbuj ponownie później.</Text>
      </main>
    );
  }

  const nadawca = meta?.extra?.from;

  return (
    <main id="tresc" className={style.uklad}>
      <PageHeader
        okruszki={[{ etykieta: "Administracja" }, { etykieta: "Powiadomienia e-mail" }]}
        tytul="Powiadomienia e-mail"
        opis="Skrzynka symulowanych e-maili (H16) — nic stąd nie wychodzi w świat, status wiadomości jest zawsze «symulowany»."
        onPowrot={() => router.back()}
      />

      <Notice wariant="info" tytul="Zakres tego ekranu">
        {nadawca
          ? `Skonfigurowany nadawca: ${nadawca.name ? `${nadawca.name} <${nadawca.address}>` : nadawca.address}.`
          : "Brak skonfigurowanego nadawcy w tym środowisku."}{" "}
        Kontrakt H16 nie ma dziś trasy do edycji ani ponownej wysyłki wiadomości — ekran pokazuje wyłącznie odczyt.
      </Notice>

      {blad && (
        <Notice wariant="error" tytul="Nie udało się wczytać">
          {blad}
        </Notice>
      )}

      <DataTable
        tytul="Wysłane wiadomości"
        kolumny={[
          { klucz: "do_email", etykieta: "Do" },
          { klucz: "temat", etykieta: "Temat" },
          { klucz: "status", etykieta: "Status" },
          { klucz: "wyslano", etykieta: "Wysłano" },
        ]}
        wiersze={wierszeTabeli}
        stronicowanie={
          meta
            ? {
                strona: meta.current_page,
                stron: meta.last_page,
                naPoprzednia: () => {
                  if (!wczytywanie && meta.current_page > 1) void przejdzNaStrone(meta.current_page - 1);
                },
                naNastepna: () => {
                  if (!wczytywanie && meta.current_page < meta.last_page)
                    void przejdzNaStrone(meta.current_page + 1);
                },
              }
            : undefined
        }
        komunikatPusty="Brak wiadomości."
      />
    </main>
  );
}
