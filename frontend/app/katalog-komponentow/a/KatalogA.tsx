"use client";

import { useMemo, useState, type ReactNode } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import Breadcrumbs from "@/components/molecules/Breadcrumbs";
import StatTile from "@/components/molecules/StatTile";
import Pagination from "@/components/molecules/Pagination";
import FilterBar from "@/components/molecules/FilterBar";
import QueueRow from "@/components/molecules/QueueRow";
import PageHeader from "@/components/molecules/PageHeader";
import DataTable, {
  type DataTableColumn,
  type DataTableSort,
} from "@/components/organisms/DataTable";
import RecordList from "@/components/organisms/RecordList";
import StatRow from "@/components/organisms/StatRow";
import DemoErrorBoundary from "./DemoErrorBoundary";

interface Zgloszenie {
  id: number;
  imie: string;
  status: "nowe" | "w toku" | "zamknięte";
  data: string;
}

const ZGLOSZENIA: Zgloszenie[] = [
  { id: 1, imie: "Anna Kowalska", status: "nowe", data: "12.09.2026" },
  { id: 2, imie: "Piotr Nowak", status: "w toku", data: "10.09.2026" },
  { id: 3, imie: "Ewa Zielińska", status: "zamknięte", data: "05.09.2026" },
];

const BADGE_WARIANT: Record<Zgloszenie["status"], "info" | "warning" | "success"> = {
  nowe: "info",
  "w toku": "warning",
  zamknięte: "success",
};

/** Ramka z etykietą stanu — pomocnik wyłącznie do porządku wizualnego w
 * katalogu, nie jeden z prezentowanych komponentów. */
function Przyklad({
  etykieta,
  opis,
  testId,
  children,
}: {
  etykieta: string;
  opis?: string;
  /** Wyłącznie do pomiaru w uruchomionej aplikacji — nie wpływa na wygląd
   * ani na żaden z prezentowanych komponentów. */
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-2 rounded-md border border-line bg-page p-4"
    >
      <p className="text-caption font-bold uppercase tracking-wide text-subtle">{etykieta}</p>
      {opis && <p className="text-small text-muted">{opis}</p>}
      <div>{children}</div>
    </div>
  );
}

function NieDotyczy({ powod }: { powod: string }) {
  return <p className="text-small text-subtle">Nie dotyczy — {powod}</p>;
}

export default function KatalogA() {
  const [sort, setSort] = useState<DataTableSort | null>({ key: "imie", direction: "asc" });
  const [strona, setStrona] = useState(2);
  const [pokazBladStatRow, setPokazBladStatRow] = useState(false);
  const [pokazBladLiczbyDominujacej, setPokazBladLiczbyDominujacej] = useState(false);
  const [pokazBladKontekstu, setPokazBladKontekstu] = useState(false);

  const kolumny: DataTableColumn<Zgloszenie>[] = [
    { key: "imie", header: "Zgłaszający", sortable: true, render: (r) => r.imie },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge variant={BADGE_WARIANT[r.status]}>{r.status}</Badge>,
    },
    { key: "data", header: "Data zgłoszenia", sortable: true, render: (r) => r.data },
  ];

  const wiersze = useMemo(() => {
    if (!sort) return ZGLOSZENIA;
    const kopia = [...ZGLOSZENIA];
    kopia.sort((a, b) => {
      const av = String(a[sort.key as keyof Zgloszenie]);
      const bv = String(b[sort.key as keyof Zgloszenie]);
      return sort.direction === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return kopia;
  }, [sort]);

  function zmienSortowanie(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: "asc" };
      return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
    });
  }

  return (
    <main id="tresc" className="mx-auto flex w-full max-w-3xl flex-col gap-10 p-6">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Start", href: "#" },
              { label: "Katalog komponentów", href: "#" },
              { label: "Zestaw A" },
            ]}
          />
        }
        title="Katalog komponentów — zestaw A"
        description="Molekuły i organizmy list i nawigacji, każdy w stanach spoczynek / fokus / błąd / wyłączony. Trasa dostępna tylko poza produkcją."
      />

      {/* 1. Breadcrumbs */}
      <section className="flex flex-col gap-3">
        <h2 className="text-h3 font-bold text-ink">Breadcrumbs</h2>
        <Przyklad etykieta="Spoczynek">
          <Breadcrumbs
            items={[
              { label: "Start", href: "#" },
              { label: "Kursy", href: "#" },
              { label: "Wprowadzenie do superwizji" },
            ]}
          />
        </Przyklad>
        <Przyklad testId="fokus-breadcrumbs" etykieta="Fokus" opis="Pierścień fokusu widoczny po Tab na odnośniku.">
          <Breadcrumbs
            items={[
              { label: "Start", href: "#" },
              { label: "Kursy", href: "#" },
              { label: "Wprowadzenie do superwizji" },
            ]}
          />
        </Przyklad>
        <NieDotyczy powod="błąd — nawigacja nie waliduje niczego, nie ma stanu błędu." />
        <NieDotyczy powod="wyłączony — odnośniki nie bywają wyłączone; ostatni element bez odnośnika to „bieżąca strona”, nie wyłączenie." />
      </section>

      {/* 2. StatTile */}
      <section className="flex flex-col gap-3">
        <h2 className="text-h3 font-bold text-ink">StatTile</h2>
        <Przyklad etykieta="Spoczynek — zwykła i dominująca">
          <div className="flex gap-8">
            <StatTile value={12} label="Otwarte zgłoszenia" variant="regular" />
            <StatTile
              value="87%"
              label="Ukończone kursy"
              variant="dominant"
              context="+4 pkt proc. wobec zeszłego miesiąca"
            />
          </div>
        </Przyklad>
        <NieDotyczy powod="fokus — kafel nie jest kontrolką, sam nie przyjmuje fokusu." />
        <NieDotyczy powod="błąd — nie waliduje danych wejściowych, wyświetla to, co dostał." />
        <NieDotyczy powod="wyłączony — nie ma stanu wyłączenia." />
      </section>

      {/* 3. Pagination */}
      <section className="flex flex-col gap-3">
        <h2 className="text-h3 font-bold text-ink">Pagination</h2>
        <Przyklad etykieta="Spoczynek">
          <Pagination strona={strona} ostatniaStrona={5} onZmien={setStrona} />
        </Przyklad>
        <Przyklad testId="fokus-pagination" etykieta="Fokus" opis="Pierścień fokusu widoczny po Tab na przycisku „Następna”.">
          <Pagination strona={strona} ostatniaStrona={5} onZmien={setStrona} />
        </Przyklad>
        <NieDotyczy powod="błąd — Pagination nie pobiera danych, nie ma własnego stanu błędu." />
        <Przyklad etykieta="Wyłączony" opis="Jedna strona = oba przyciski nieaktywne.">
          <Pagination strona={1} ostatniaStrona={1} onZmien={() => {}} />
        </Przyklad>
      </section>

      {/* 4. FilterBar */}
      <section className="flex flex-col gap-3">
        <h2 className="text-h3 font-bold text-ink">FilterBar</h2>
        <Przyklad etykieta="Spoczynek">
          <FilterBar label="Filtry zgłoszeń">
            <Select label="Status" defaultValue="wszystkie">
              <option value="wszystkie">Wszystkie</option>
              <option value="nowe">Nowe</option>
              <option value="w toku">W toku</option>
            </Select>
            <Input label="Szukaj po nazwisku" placeholder="np. Kowalska" />
          </FilterBar>
        </Przyklad>
        <Przyklad testId="fokus-filterbar" etykieta="Fokus" opis="Pierścień fokusu widoczny po Tab na polu „Status”.">
          <FilterBar label="Filtry zgłoszeń">
            <Select label="Status" defaultValue="wszystkie">
              <option value="wszystkie">Wszystkie</option>
              <option value="nowe">Nowe</option>
            </Select>
            <Input label="Szukaj po nazwisku" placeholder="np. Kowalska" />
          </FilterBar>
        </Przyklad>
        <Przyklad etykieta="Błąd" opis="Błąd należy do pojedynczego pola (Field/Select), nie do paska.">
          <FilterBar label="Filtry zgłoszeń">
            <Select label="Status" error="Wybierz status z listy." defaultValue="">
              <option value="">— wybierz —</option>
              <option value="nowe">Nowe</option>
            </Select>
          </FilterBar>
        </Przyklad>
        <Przyklad etykieta="Wyłączony">
          <FilterBar label="Filtry zgłoszeń">
            <Input label="Szukaj po nazwisku" placeholder="Filtr niedostępny" disabled />
          </FilterBar>
        </Przyklad>
      </section>

      {/* 5. QueueRow */}
      <section className="flex flex-col gap-3">
        <h2 className="text-h3 font-bold text-ink">QueueRow</h2>
        <Przyklad etykieta="Spoczynek">
          <QueueRow
            title="Anna Kowalska — profil do zatwierdzenia"
            description="Zgłoszone 12.09.2026"
            meta={<Badge variant="info">nowe</Badge>}
            href="#"
          />
        </Przyklad>
        <Przyklad testId="fokus-queuerow" etykieta="Fokus" opis="Pierścień fokusu widoczny po Tab na całym wierszu.">
          <QueueRow
            title="Anna Kowalska — profil do zatwierdzenia"
            description="Zgłoszone 12.09.2026"
            meta={<Badge variant="info">nowe</Badge>}
            href="#"
          />
        </Przyklad>
        <NieDotyczy powod="błąd — pojedynczy wiersz nie ma własnego stanu błędu; błąd całej listy pokazuje DataTable/ErrorState." />
        <Przyklad etykieta="Wyłączony" opis="Pozycja już obsłużona — bez akcji.">
          <QueueRow
            title="Piotr Nowak — profil zatwierdzony"
            description="Zamknięte 10.09.2026"
            meta={<Badge variant="success">zamknięte</Badge>}
            disabled
          />
        </Przyklad>
      </section>

      {/* 6. DataTable */}
      <section className="flex flex-col gap-3">
        <h2 className="text-h3 font-bold text-ink">DataTable</h2>
        <p className="text-small text-muted">
          5 stanów zamiast czterech kanonicznych: „spoczynek” = dane, „fokus” = przycisk
          sortowania nagłówka, „błąd” = stan błędu wprost, „wyłączony” = odmowa (tabela
          nieinteraktywna dla tej roli). Dodatkowo pokazane „pusty” i „ładowanie”, bo to
          integralna część tego organizmu.
        </p>
        <Przyklad etykieta="Ładowanie">
          <DataTable columns={kolumny} rows={[]} rowKey={(r) => r.id} stan="loading" />
        </Przyklad>
        <Przyklad etykieta="Błąd">
          <DataTable
            columns={kolumny}
            rows={[]}
            rowKey={(r) => r.id}
            stan="error"
            komunikatBledu="Nie udało się pobrać listy zgłoszeń."
            onPonow={() => {}}
          />
        </Przyklad>
        <Przyklad etykieta="Pusty">
          <DataTable
            columns={kolumny}
            rows={[]}
            rowKey={(r) => r.id}
            stan="empty"
            pustyTytul="Brak zgłoszeń."
            pustyOpis="Nowe zgłoszenia pojawią się tutaj automatycznie."
          />
        </Przyklad>
        <Przyklad etykieta="Wyłączony (odmowa)">
          <DataTable
            columns={kolumny}
            rows={[]}
            rowKey={(r) => r.id}
            stan="forbidden"
            komunikatBrakUprawnien="Nie masz uprawnień do listy zgłoszeń."
          />
        </Przyklad>
        <Przyklad
          testId="fokus-datatable"
          etykieta="Dane (spoczynek + fokus na sortowaniu)"
          opis="Klawisz Tab + Enter na nagłówku „Zgłaszający” zmienia kierunek sortowania."
        >
          <DataTable
            columns={kolumny}
            rows={wiersze}
            rowKey={(r) => r.id}
            stan="success"
            caption="Lista zgłoszeń"
            sort={sort}
            onSortChange={zmienSortowanie}
            paginacja={{ strona, ostatniaStrona: 3, onZmien: setStrona }}
          />
        </Przyklad>
      </section>

      {/* 7. RecordList */}
      <section className="flex flex-col gap-3">
        <h2 className="text-h3 font-bold text-ink">RecordList</h2>
        <Przyklad etykieta="Spoczynek">
          <RecordList
            rows={ZGLOSZENIA}
            rowKey={(r) => r.id}
            caption="Lista zgłoszeń (widok kart)"
            renderItem={(r) => (
              <>
                <span className="text-body font-medium text-ink">{r.imie}</span>
                <span className="text-small text-muted">{r.data}</span>
                <Badge variant={BADGE_WARIANT[r.status]}>{r.status}</Badge>
              </>
            )}
            renderAction={() => (
              <Button variant="secondary" className="min-h-11">
                Otwórz
              </Button>
            )}
          />
        </Przyklad>
        <Przyklad testId="fokus-recordlist" etykieta="Fokus" opis="Pierścień fokusu widoczny po Tab na przycisku „Otwórz” pierwszej karty.">
          <RecordList
            rows={ZGLOSZENIA.slice(0, 1)}
            rowKey={(r) => r.id}
            renderItem={(r) => <span className="text-body font-medium text-ink">{r.imie}</span>}
            renderAction={() => (
              <Button variant="secondary" className="min-h-11">
                Otwórz
              </Button>
            )}
          />
        </Przyklad>
        <NieDotyczy powod="błąd — stan błędu należy do wywołującego (DataTable/ErrorState), RecordList renderuje tylko dane." />
        <Przyklad etykieta="Wyłączony" opis="Akcja niedostępna dla tej pozycji.">
          <RecordList
            rows={ZGLOSZENIA.slice(1, 2)}
            rowKey={(r) => r.id}
            renderItem={(r) => <span className="text-body font-medium text-ink">{r.imie}</span>}
            renderAction={() => (
              <Button variant="secondary" className="min-h-11" disabled>
                Otwórz
              </Button>
            )}
          />
        </Przyklad>
      </section>

      {/* 8. StatRow */}
      <section className="flex flex-col gap-3">
        <h2 className="text-h3 font-bold text-ink">StatRow</h2>
        <Przyklad etykieta="Spoczynek">
          <StatRow
            items={[
              { value: 24, label: "Aktywni uczestnicy", context: "+3 w tym tygodniu", dominant: true },
              { value: 12, label: "Otwarte zgłoszenia" },
              { value: 4, label: "Oczekujące certyfikaty" },
              { value: 87, label: "Ukończone lekcje" },
            ]}
          />
        </Przyklad>
        <NieDotyczy powod="fokus — kafle StatTile nie są kontrolkami." />
        <Przyklad
          etykieta="Błąd"
          opis="Trzy przyciski niżej wyzwalają błąd dopiero po stronie klienta (żeby nie ubijać renderu serwera tej strony); każdy złapany przez osobną granicę błędu."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-small text-muted">Piąty kafel</p>
              {pokazBladStatRow ? (
                <DemoErrorBoundary>
                  <StatRow
                    items={[
                      { value: 24, label: "Aktywni uczestnicy", dominant: true, context: "+3 w tym tygodniu" },
                      { value: 12, label: "Otwarte zgłoszenia" },
                      { value: 4, label: "Oczekujące certyfikaty" },
                      { value: 87, label: "Ukończone lekcje" },
                      { value: 1, label: "Piąty kafel — błąd" },
                    ]}
                  />
                </DemoErrorBoundary>
              ) : (
                <Button variant="secondary" onClick={() => setPokazBladStatRow(true)}>
                  Pokaż piąty kafel (wywołaj błąd)
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-small text-muted">Dwie liczby dominujące zamiast jednej</p>
              {pokazBladLiczbyDominujacej ? (
                <DemoErrorBoundary>
                  <StatRow
                    items={[
                      { value: 24, label: "Aktywni uczestnicy", dominant: true, context: "+3 w tym tygodniu" },
                      { value: 12, label: "Otwarte zgłoszenia", dominant: true },
                      { value: 4, label: "Oczekujące certyfikaty" },
                    ]}
                  />
                </DemoErrorBoundary>
              ) : (
                <Button variant="secondary" onClick={() => setPokazBladLiczbyDominujacej(true)}>
                  Pokaż dwie dominujące (wywołaj błąd)
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-small text-muted">Liczba dominująca bez kontekstu</p>
              {pokazBladKontekstu ? (
                <DemoErrorBoundary>
                  <StatRow
                    items={[
                      { value: 24, label: "Aktywni uczestnicy", dominant: true },
                      { value: 12, label: "Otwarte zgłoszenia" },
                      { value: 4, label: "Oczekujące certyfikaty" },
                    ]}
                  />
                </DemoErrorBoundary>
              ) : (
                <Button variant="secondary" onClick={() => setPokazBladKontekstu(true)}>
                  Pokaż dominującą bez kontekstu (wywołaj błąd)
                </Button>
              )}
            </div>
          </div>
        </Przyklad>
        <NieDotyczy powod="wyłączony — komponent nie ma stanu wyłączenia." />
      </section>
    </main>
  );
}
