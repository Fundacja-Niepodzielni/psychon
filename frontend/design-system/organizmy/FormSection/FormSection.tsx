"use client";

import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from "react";
import { Heading } from "../../atomy/Heading/Heading";
import { Link } from "../../atomy/Link/Link";
import { Button } from "../../atomy/Button/Button";
import { Notice } from "../../molekuly/Notice/Notice";
import { Field } from "../../molekuly/Field/Field";
import { CollapsibleSection } from "../../molekuly/CollapsibleSection/CollapsibleSection";
import style from "./FormSection.module.css";

/** Pole formularza — właściwości `Field` + jego własny błąd, JEDNO źródło
 * prawdy dla pola i dla podsumowania błędów (patrz `bledy` niżej) — ta sama
 * zasada co suma w stopce listy rekordów, liczona z tej samej listy co
 * treść, nigdy z osobnego licznika, który mógłby się rozjechać. */
export type PoleFormSection = ComponentProps<typeof Field>;

interface WlasciwosciFormSection {
  tytul: string;
  /** Wszystkie pola sekcji. Pierwsze PIĘĆ renderuje się od razu; reszta
   * wchodzi do `CollapsibleSection` — wymaga `tytulDodatkowych`, gdy
   * `pola.length` przekracza 5. */
  pola: PoleFormSection[];
  /** Tytuł `CollapsibleSection` dla pól poza pierwszym poziomem — domenowy,
   * więc podaje go wywołujący (np. „Dane adresowe”); ta sekcja sama nie
   * zgaduje nazwy dla cudzej treści. */
  tytulDodatkowych?: string;
  etykietaAnuluj?: string;
  etykietaZapisz?: string;
  onAnuluj: () => void;
  onZapisz: () => void;
  /** Kolumna ≤ 640 px domyślnie; wariant `lekcja` rozszerza do 760 px. */
  szerokosc?: "domyslna" | "lekcja";
}

/**
 * Sekcja formularza `FormSection`. `Heading` + `Notice` (podsumowanie
 * błędów, wariant `error`, odnośniki do pól) + `Field` × n +
 * `CollapsibleSection` (pola poza pierwszym poziomem) + rząd przycisków.
 * Błędy pól NIE są osobną listą — wyciągnięte z `pola[].blad`, żeby
 * podsumowanie i pole pod nim zawsze zgadzały się (nie da się ich
 * rozjechać, bo to ten sam wpis). Gdy błąd dotyczy pola poza pierwszym
 * poziomem, sekcja z dodatkowymi polami startuje ROZWINIĘTA — inaczej
 * odnośnik podsumowania prowadziłby do pola, którego zwinięta sekcja
 * w ogóle nie renderuje w DOM.
 *
 * „Zapisz…” dostaje ramkę i tło (`Button` `primary`), „Anuluj” żadnego
 * z nich (`Button` `quiet`) — różnią się oboma naraz. Fokus startowy
 * ląduje na PIERWSZYM polu przy montowaniu; gdy podsumowanie błędów jest
 * obecne PRZY montowaniu, fokus ląduje tam zamiast na polu — użytkownik
 * ma najpierw przeczytać, co poprawić. Fokus przenosi się WYŁĄCZNIE raz,
 * przy zamontowaniu (zależności efektu puste): sekcja nie skacze
 * z powrotem na górę przy KAŻDEJ zmianie stanu `zapisano` — po zapisie
 * ekran nie wraca na górę, powiadomienie o zapisie jest sprawą strony,
 * nie tej sekcji.
 *
 * Formularz ma `noValidate` — walidacja przeglądarki (dymek „Please fill
 * out this field.”) blokowała wywołanie `onZapisz` dla pustego pola
 * wymaganego i nigdy nie pokazywała podsumowania błędów tej sekcji;
 * z `noValidate` `onZapisz` woła się zawsze, a to wywołujący decyduje,
 * jakie `blad` wrócą w kolejnym renderze `pola`.
 *
 * Klawisz Escape woła `onAnuluj` — ten sam skutek co przycisk „Anuluj”.
 * Wyjście oddaje fokus elementowi aktywnemu PRZED zamontowaniem sekcji
 * (przycisk wołający), tym samym wzorcem co w oknie `Dialog`: przechwycone
 * w leniwym inicjalizatorze `useState`, przywrócone w sprzątaniu efektu
 * przy odmontowaniu.
 *
 * Ograniczenie jawne: „otwiera się przy wierszu albo tytule, nie na dole
 * strony” to MIEJSCE montowania w DOM, o którym decyduje wywołująca strona
 * (gdzie w drzewie umieści `<FormSection>`) — ten komponent nie zna
 * własnej pozycji względem wiersza, który go otworzył, więc nie może tego
 * wymusić sam.
 */
export function FormSection({
  tytul,
  pola,
  tytulDodatkowych,
  etykietaAnuluj = "Anuluj",
  etykietaZapisz = "Zapisz zmiany",
  onAnuluj,
  onZapisz,
  szerokosc = "domyslna",
}: WlasciwosciFormSection) {
  const pierwszyPoziom = pola.slice(0, 5);
  const dodatkowe = pola.slice(5);
  const bledy = pola.filter((pole) => pole.blad);
  const bledyWDodatkowych = dodatkowe.some((pole) => pole.blad);

  const kontenerRef = useRef<HTMLFormElement>(null);

  // Ten sam wzorzec co w oknie `Dialog`: przechwycone w LENIWYM
  // INICJALIZATORZE `useState`, nie w efekcie, żeby złapać element aktywny
  // PRZED tym, jak własny efekt niżej (albo efekt `DialogActions`-podobnego
  // dziecka) przeniesie fokus gdzie indziej.
  const [elementSprzedOtwarciem] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );

  useEffect(() => {
    return () => {
      elementSprzedOtwarciem?.focus?.();
    };
  }, [elementSprzedOtwarciem]);

  useEffect(() => {
    // `Notice` (wariant `error`) niesie WŁASNY `role="alert"` i WŁASNY
    // `tabIndex={-1}` (wszystkie warianty przyjmują fokus programowy) —
    // ten efekt celuje wprost w ten węzeł zamiast dokładać drugi,
    // opakowujący `tabIndex`, żeby fokus i ogłoszenie czytnika
    // (`role="alert"`) trafiały w TEN SAM element.
    const cel = bledy.length > 0
      ? kontenerRef.current?.querySelector<HTMLElement>('[role="alert"]')
      : kontenerRef.current?.querySelector<HTMLElement>("input, textarea, button, [role='combobox']");
    cel?.focus();
    // Wyłącznie przy zamontowaniu — patrz dokumentacja funkcji wyżej.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function naKlawisz(zdarzenie: KeyboardEvent) {
      if (zdarzenie.key === "Escape") {
        zdarzenie.preventDefault();
        onAnuluj();
      }
    }
    document.addEventListener("keydown", naKlawisz);
    return () => document.removeEventListener("keydown", naKlawisz);
  }, [onAnuluj]);

  function naZapisz(zdarzenie: FormEvent<HTMLFormElement>) {
    zdarzenie.preventDefault();
    onZapisz();
  }

  return (
    <form
      ref={kontenerRef}
      className={`${style.sekcja} ${szerokosc === "lekcja" ? style.lekcja : ""}`.trim()}
      onSubmit={naZapisz}
      aria-label={tytul}
      noValidate
    >
      <Heading stopien={2}>{tytul}</Heading>

      {bledy.length > 0 && (
        <Notice wariant="error" tytul="Popraw zaznaczone pola">
          {bledy.map((pole, indeks) => (
            <span key={pole.id} className={style.odnosnikBledu}>
              {indeks > 0 && ", "}
              <Link href={`#${pole.id}`}>{pole.etykieta}</Link>
            </span>
          ))}
        </Notice>
      )}

      <div className={style.pola}>
        {pierwszyPoziom.map((pole) => (
          <Field key={pole.id} {...pole} />
        ))}
      </div>

      {dodatkowe.length > 0 && (
        <CollapsibleSection
          tytul={tytulDodatkowych ?? "Więcej pól"}
          liczba={dodatkowe.length}
          domyslnieRozwinieta={bledyWDodatkowych}
          dzieci={
            <div className={style.pola}>
              {dodatkowe.map((pole) => (
                <Field key={pole.id} {...pole} />
              ))}
            </div>
          }
        />
      )}

      <div className={style.przyciski}>
        <Button type="button" poziom="quiet" onClick={onAnuluj}>
          {etykietaAnuluj}
        </Button>
        <Button type="submit" poziom="primary">
          {etykietaZapisz}
        </Button>
      </div>
    </form>
  );
}
