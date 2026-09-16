"use client";

import { useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/molecules/PageHeader";
import ConfirmDialog from "@/components/organisms/ConfirmDialog";
import PanelNav, { type PanelNavGroup } from "@/components/organisms/PanelNav";
import NotificationList from "@/components/organisms/NotificationList";
import MainBlock from "@/components/organisms/MainBlock";
import SupportBlock from "@/components/organisms/SupportBlock";
import RecordForm, { type RecordFormField } from "@/components/organisms/RecordForm";
import type { NotificationItem } from "@/lib/notifications/types";

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-8 first:border-t-0 first:pt-0">
      <h2 className="text-h3 font-black text-ink">{title}</h2>
      {children}
    </section>
  );
}

function StateBlock({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-card-warm p-4">
      <p className="text-caption font-bold uppercase tracking-wide text-subtle">{label}</p>
      {note && <p className="text-small text-muted">{note}</p>}
      {children}
    </div>
  );
}

const NAV_GROUPS: PanelNavGroup[] = [
  {
    label: "Główne",
    items: [
      { label: "Pulpit", href: "/panel/pulpit" },
      { label: "Kursy", href: "/panel/kursy" },
      { label: "Profil", href: "/panel/profil" },
    ],
  },
  {
    label: "Wsparcie",
    items: [
      { label: "Superwizja", href: "/panel/superwizja" },
      { label: "Dokumenty", href: "/panel/dokumenty" },
    ],
  },
];

const NOTIFICATIONS: NotificationItem[] = [
  {
    id: 1,
    type: "course",
    title: "Nowa lekcja w kursie „Podstawy superwizji”",
    body: "Lekcja 4 jest już dostępna.",
    link: "/panel/kursy",
    read_at: null,
    created_at: "2026-09-15T09:12:00Z",
  },
  {
    id: 2,
    type: "certificate",
    title: "Certyfikat wygenerowany",
    body: "Certyfikat ukończenia kursu czeka do pobrania.",
    link: "/panel/certyfikat",
    read_at: "2026-09-14T18:00:00Z",
    created_at: "2026-09-14T17:40:00Z",
  },
];

const RECORD_FIELDS: RecordFormField[] = [
  { name: "first_name", label: "Imię", required: true },
  { name: "email", label: "E-mail", type: "email", required: true },
  { name: "phone", label: "Telefon", type: "tel" },
  { name: "note", label: "Notatka", type: "textarea", hint: "Widoczna tylko dla zespołu." },
];

/**
 * Treść kliencka katalogu przykładów P3b. Każdy organizm dostaje do 4 bloków
 * stanu (spoczynek / fokus / błąd / wyłączony); tam, gdzie stan nie ma
 * sensu dla danego organizmu, blok tłumaczy dlaczego jednym zdaniem zamiast
 * renderować atrapę.
 */
export default function KatalogPrzykladyB() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogLoadingOpen, setDialogLoadingOpen] = useState(false);

  const [formValues, setFormValues] = useState<Record<string, string>>({
    first_name: "Anna",
    email: "anna@przyklad.pl",
    phone: "600000000",
    note: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formDisabled, setFormDisabled] = useState(false);

  function handleChange(name: string, value: string) {
    setFormValues((current) => ({ ...current, [name]: value }));
  }

  function simulateServerRejection() {
    setFormErrors({
      email: "Ten adres e-mail jest już zajęty.",
      phone: "Numer telefonu ma nieprawidłowy format.",
    });
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-8">
      <PageHeader
        title="Katalog komponentów — partia B"
        description="Organizmy okna, nawigacji, powiadomień i formularza (ConfirmDialog, PanelNav, NotificationList, MainBlock, SupportBlock, RecordForm). Narzędzie pracy zespołu — w produkcji ta trasa zwraca 404."
      />

      <Section title="ConfirmDialog">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setDialogOpen(true)}>
            Otwórz okno potwierdzenia
          </Button>
          <Button variant="secondary" onClick={() => setDialogLoadingOpen(true)}>
            Otwórz: wersja wyłączona (trwa zapis)
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <StateBlock
            label="Spoczynek"
            note="Przycisk wyżej otwiera okno: fokus trafia do okna, Tab krąży między „Potwierdź” i „Anuluj”, Escape zamyka i oddaje fokus przyciskowi, który okno otworzył (zmierzone w K2 tego zlecenia, trzy pomiary)."
          />
          <StateBlock
            label="Fokus"
            note="Stan sterowany klawiaturą, nie osobnym renderem: po otwarciu fokus jest w oknie (kontener „role=dialog”), Tab nie wychodzi poza dwa przyciski, Shift+Tab z pierwszego wraca na ostatni. Zmierzone na żywo w K2 — bez osobnego bloku tutaj, żeby nie duplikować tego samego stanu dwoma renderami."
          />
          <StateBlock
            label="Błąd"
            note="Nie dotyczy: okno niczego nie waliduje samo — to formularz wewnątrz (patrz RecordForm niżej) mapuje odmowę serwera na pole. ConfirmDialog tylko potwierdza albo anuluje decyzję."
          />
          <StateBlock label="Wyłączony" note="Przycisk wyżej otwiera okno z zablokowanymi akcjami — patrz drugie okno.">
            <p className="text-caption text-subtle">
              Po otwarciu: „Potwierdź” pokazuje spinner i jest zablokowany (<code>aria-busy</code>), „Anuluj” zablokowany na czas zapisu.
            </p>
          </StateBlock>
        </div>

        <ConfirmDialog
          open={dialogOpen}
          title="Usunąć wersję roboczą?"
          description="Tej operacji nie można cofnąć."
          confirmLabel="Usuń"
          confirmVariant="secondary"
          onConfirm={() => setDialogOpen(false)}
          onCancel={() => setDialogOpen(false)}
        />
        <ConfirmDialog
          open={dialogLoadingOpen}
          title="Zapisywanie…"
          description="Trwa zapis zmian — okno zamyka się automatycznie po zakończeniu."
          confirmLabel="Zapisywanie…"
          loading
          onConfirm={() => setDialogLoadingOpen(false)}
          onCancel={() => setDialogLoadingOpen(false)}
        />
      </Section>

      <Section title="PanelNav">
        <div className="grid gap-4 md:grid-cols-2">
          <StateBlock label="Spoczynek">
            <PanelNav groups={NAV_GROUPS} currentPath="/panel/kursy" className="rounded-md border border-line bg-card p-3" />
          </StateBlock>
          <StateBlock
            label="Fokus"
            note="Zmierzone na żywo: Tab po kolei zaznacza każdą pozycję pierścieniem z tokenu (`focus-visible:focus-ring`); pole dotykowe każdej pozycji ma min. 44 px (`min-h-11`)."
          />
          <StateBlock
            label="Błąd"
            note="Nie dotyczy: PanelNav nie pobiera danych sam — błąd wczytania listy pozycji obsługuje wołający ekran (np. przez ErrorState), zanim przekaże `groups` do tego komponentu."
          />
          <StateBlock
            label="Wyłączony"
            note="Nie dotyczy: pozycje niedostępne dla roli są całkowicie usuwane z listy zanim trafi do tego komponentu (Z-7) — nawigacja nie pokazuje wyszarzonych, niedostępnych odnośników."
          />
        </div>
      </Section>

      <Section title="NotificationList">
        <div className="grid gap-4 md:grid-cols-2">
          <StateBlock label="Spoczynek">
            <NotificationList items={NOTIFICATIONS} className="max-w-sm" />
          </StateBlock>
          <StateBlock
            label="Fokus"
            note="Zmierzone na żywo: Tab wchodzi kolejno w przyciski pozycji (każdy min. 44 px wysokości), pierścień fokusu z tokenu."
          />
          <StateBlock label="Błąd">
            <NotificationList items={[]} error="Nie udało się wczytać powiadomień." onRetry={() => {}} className="max-w-sm" />
          </StateBlock>
          <StateBlock label="Wyłączony">
            <NotificationList items={NOTIFICATIONS} disabled className="max-w-sm" />
          </StateBlock>
        </div>
      </Section>

      <Section title="MainBlock (S2) i SupportBlock (S3)">
        <div className="grid gap-4 md:grid-cols-2">
          <StateBlock label="Spoczynek — MainBlock">
            <MainBlock
              title="Dokończ profil, żeby zacząć superwizję"
              description="Brakuje jednego pola: numeru licencji."
              action={<Button variant="primary">Uzupełnij profil</Button>}
            />
          </StateBlock>
          <StateBlock label="Spoczynek — SupportBlock">
            <SupportBlock
              title="Materiały pomocnicze"
              description="Skrócony przewodnik po pierwszym miesiącu."
              action={<Button variant="secondary">Otwórz przewodnik</Button>}
            />
          </StateBlock>
          <StateBlock
            label="Fokus"
            note="Zmierzone na żywo: Tab wchodzi w przycisk akcji obu bloków, pierścień fokusu z tokenu identyczny jak w Button."
          />
          <StateBlock
            label="Błąd"
            note="Nie dotyczy: oba bloki nie pobierają danych same — gdy dane się nie wczytają, wołający ekran renderuje ErrorState zamiast bloku, nie blok z błędem w środku."
          />
          <StateBlock label="Wyłączony — akcja zablokowana">
            <MainBlock
              title="Trwa zapisywanie oceny"
              description="Akcja jest chwilowo niedostępna."
              action={
                <Button variant="primary" disabled>
                  Uzupełnij profil
                </Button>
              }
            />
          </StateBlock>
        </div>
      </Section>

      <Section title="RecordForm">
        <div className="grid gap-4">
          <StateBlock label="Spoczynek">
            <RecordForm
              fields={RECORD_FIELDS}
              values={formValues}
              onChange={handleChange}
              onSubmit={(event) => event.preventDefault()}
              className="max-w-md"
            />
          </StateBlock>
          <StateBlock
            label="Fokus"
            note="Po odmowie serwera (blok „Błąd” niżej) fokus programowo wraca na pierwsze błędne pole (Z-15) — zmierzone przy kliknięciu przycisku niżej, nie osobnym statycznym renderem."
          >
            <Button variant="secondary" onClick={simulateServerRejection}>
              Symuluj odmowę serwera (2 pola)
            </Button>
          </StateBlock>
          <StateBlock
            label="Błąd — odmowa dwóch pól"
            note="„aria-invalid=true” na e-mailu i telefonie, plus dwa odnośniki w podsumowaniu u góry (K7)."
          >
            <RecordForm
              fields={RECORD_FIELDS}
              values={formValues}
              onChange={handleChange}
              fieldErrors={formErrors}
              onSubmit={(event) => event.preventDefault()}
              className="max-w-md"
            />
          </StateBlock>
          <StateBlock label="Wyłączony">
            <Button variant="secondary" className="mb-3" onClick={() => setFormDisabled((value) => !value)}>
              {formDisabled ? "Odblokuj formularz" : "Zablokuj formularz (disabled)"}
            </Button>
            <RecordForm
              fields={RECORD_FIELDS}
              values={formValues}
              onChange={handleChange}
              disabled={formDisabled}
              onSubmit={(event) => event.preventDefault()}
              className="max-w-md"
            />
          </StateBlock>
        </div>
      </Section>
    </main>
  );
}
