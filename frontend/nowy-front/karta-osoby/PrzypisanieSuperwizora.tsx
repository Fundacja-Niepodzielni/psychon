"use client";

import { useEffect, useState } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { Field } from "@/design-system/molekuly/Field/Field";
import { Notice } from "@/design-system/molekuly/Notice/Notice";
import { Toast } from "@/design-system/molekuly/Toast/Toast";
import { assignSupervisor, type AdminUserListItem } from "@/lib/api/h18";
import { fetchInstructors, type CurrentSupervisor } from "@/lib/api/przypisanie-prowadzacego";
import { formatujDateICzas } from "../wspolne/daty";
import { zdanieBleduCzynnosci } from "./dane";
import style from "./KartaOsoby.module.css";

interface WlasciwosciPrzypisaniaSuperwizora {
  userId: number;
  /** Bieżący prowadzący z karty osoby albo `null` — zdanie „Prowadzącym jest teraz …”. */
  obecny?: CurrentSupervisor | null;
}

/**
 * Nadanie prowadzącego superwizje z karty osoby — `PUT /admin/users/{id}/supervisor`
 * z ciałem `{ supervisor_id }` (opiekun projektu i administrator). Kandydaci:
 * `fetchInstructors()` — tylko aktywne konta prowadzących. O dopuszczalności przypisania
 * rozstrzyga serwer — odmowę pokazujemy zdaniem z koperty błędu; przycisk blokuje
 * tylko brak wskazanej osoby i trwające żądanie. Bieżącego prowadzącego z karty
 * pokazuje to samo zdanie co po nadaniu; po nadaniu zdanie mówi o nowym.
 */
export function PrzypisanieSuperwizora({ userId, obecny = null }: WlasciwosciPrzypisaniaSuperwizora) {
  const [prowadzacy, setProwadzacy] = useState<AdminUserListItem[]>([]);
  const [bladListy, setBladListy] = useState<string | null>(null);
  const [wybrany, setWybrany] = useState("");
  const [zapisywanie, setZapisywanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [przypisany, setPrzypisany] = useState<{ nazwa: string; od: string | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let anulowane = false;
    fetchInstructors()
      .then((aktywni) => {
        if (!anulowane) setProwadzacy(aktywni);
      })
      .catch((wyjatek: unknown) => {
        if (anulowane) return;
        setBladListy(zdanieBleduCzynnosci(wyjatek, "Nie udało się wczytać listy prowadzących."));
      });
    return () => {
      anulowane = true;
    };
  }, []);

  async function zapisz() {
    const idProwadzacego = Number(wybrany);
    if (!idProwadzacego || zapisywanie) return;
    setZapisywanie(true);
    setBlad(null);
    setPrzypisany(null);
    try {
      const przypisanie = await assignSupervisor(userId, idProwadzacego);
      const osoba = prowadzacy.find((wiersz) => wiersz.id === przypisanie.supervisor_id);
      const nazwa = osoba ? `${osoba.first_name} ${osoba.last_name}` : `osoba nr ${przypisanie.supervisor_id}`;
      setPrzypisany({ nazwa, od: przypisanie.assigned_at });
      setToast(`Nadano prowadzącego: ${nazwa}.`);
    } catch (wyjatek) {
      setBlad(zdanieBleduCzynnosci(wyjatek, "Nie udało się nadać prowadzącego. Spróbuj ponownie."));
    } finally {
      setZapisywanie(false);
    }
  }

  return (
    <section className={style.czynnosc} aria-labelledby="czynnosc-prowadzacy-naglowek">
      <Heading stopien={2} id="czynnosc-prowadzacy-naglowek">
        Prowadzący superwizje
      </Heading>
      <Text>Wskazana osoba przejmuje superwizję tej osoby — poprzednie przypisanie zamyka się samo.</Text>
      {bladListy !== null && (
        <Notice wariant="error" tytul="Lista prowadzących niedostępna">
          {bladListy}
        </Notice>
      )}
      {blad !== null && (
        <Notice wariant="error" tytul="Nie nadano prowadzącego">
          {blad}
        </Notice>
      )}
      {przypisany !== null && (
        <Text>
          Prowadzącym jest teraz {przypisany.nazwa}
          {przypisany.od ? ` (od ${formatujDateICzas(przypisany.od)})` : ""}.
        </Text>
      )}
      {przypisany === null && obecny !== null && <Text>Prowadzącym jest teraz {obecny.name}.</Text>}
      <Field
        id="czynnosc-prowadzacy-wybor"
        etykieta="Prowadzący"
        rodzaj="wybor"
        wartosc={wybrany}
        onZmiana={setWybrany}
        opcje={[
          { wartosc: "", etykieta: "Wybierz osobę" },
          ...prowadzacy.map((wiersz) => ({
            wartosc: String(wiersz.id),
            etykieta: `${wiersz.first_name} ${wiersz.last_name} (${wiersz.email})`,
          })),
        ]}
      />
      <div className={style.przyciskCzynnosci}>
        <Button poziom="outline" disabled={wybrany === "" || zapisywanie} onClick={() => void zapisz()}>
          Nadaj prowadzącego
        </Button>
      </div>
      {toast !== null && <Toast komunikat={toast} onZamknij={() => setToast(null)} />}
    </section>
  );
}
