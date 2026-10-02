# Pomiar dziennika działań przed zmianą

Stan gałęzi `sprint-2` (commit `1d03784`). Pomiar zrobiony z kodu:

- zaplecze: `AuditController`, `AuditIndexRequest`, `AdminAuditQuery`, `AuditLogEntryResource`,
  `AuditLog::record` i wszystkie miejsca, które go wołają;
- front: stary ekran `frontend/components/h20/AuditLogView.tsx` z `AuditDetailsCell.tsx`,
  funkcje `frontend/lib/api/h20.ts` i etykiety `frontend/lib/h20/labels.ts`.

Kod przeczytany, niczego w nim nie zmieniano.

## Trasy i dostęp

- `GET /api/v1/admin/audit` — lista;
- `GET /api/v1/admin/audit/export.csv` — eksport.

Obie trasy są tylko dla ról `project_manager` i `super_admin` (pośrednik roli trasy). Inna rola
dostaje 403, brak tokenu daje 401. Tras zmiany i usuwania wpisu nie ma — próba daje 404.

## Filtry i strony, które zaplecze przyjmuje

| Parametr | Reguła | Co robi |
|---|---|---|
| `action` | jeden kod z zamkniętej listy 34 kodów (`AuditIndexRequest::ACTIONS`); inny → 422 | wpisy jednego kodu |
| `user_id` | liczba całkowita | wpisy, których **wykonawcą** (`actor_id`) jest ta osoba — nie osobą, której wpis dotyczy |
| `from` | data | `created_at >= from` |
| `to` | data | `created_at <= to`; sama data `RRRR-MM-DD` to północ tego dnia, więc wpisy z dnia „Do” **nie wchodzą** do wyniku |
| `page` | bez reguły | numer strony |
| `per_page` | bez reguły; wartość obcinana do 1–100, domyślnie 25 | rozmiar strony |

Lista jest już stronicowana: odpowiedź niesie `meta.current_page`, `per_page`, `total` i
`last_page`, kolejność od najnowszego wpisu (`created_at`, potem `id`, malejąco).

Nie ma filtra po osobie, której wpis dotyczy, filtra grup ani wyszukiwania po imieniu i nazwisku.

## Pola wpisu w odpowiedzi listy

`id`, `action` (kod), `actor` (`id`, `first_name`, `last_name` albo `null`), `subject_type`
(nazwa klasy modelu, np. `InternshipEntry`), `subject_id` (liczba), `details` (cały ładunek
zdarzenia, bez filtrowania) i `created_at`.

## Format eksportu

CSV ze wspólnego modułu (`Csv::download`): znacznik BOM, separator `;`, nazwa pliku
`dziennik.csv`. Pierwszy wiersz to techniczne nazwy kolumn:

`id;action;actor_id;actor_name;subject_type;subject_id;details;created_at`

`details` jest zapisany jako JSON, `created_at` w zapisie ISO 8601 UTC. Eksport ma te same filtry
co lista, ale bez stron — zawsze cały wynik.

## Co pokazuje stary ekran

- **Kolumny:**
  - „Kiedy” — data z godziną z własnego formatera przeglądarki;
  - „Zdarzenie” — etykieta kodu z `ACTION_LABELS`;
  - „Kto” — imię i nazwisko wykonawcy albo „—”;
  - „Dotyczy” — tekst techniczny `"{subject_type} #{subject_id}"`, np. `InternshipEntry #91`;
  - „Szczegóły” — surowy JSON ładunku, skrócony do 120 znaków, z rozwinięciem do całości.
- **Filtry:**
  - „Zdarzenie” — lista 34 etykiet, jedna na kod;
  - „ID osoby” — liczba wpisywana ręcznie, filtruje wykonawcę;
  - „Od” i „Do”;
  - przycisk „Filtruj”.
- **Strony:** po 25 wpisów, stronicowanie szablonu.
- **Eksport:** „Eksport CSV” z bieżącymi filtrami.
- **Telefon:** tabela przewija się w bok, a „Dotyczy” jest poza ekranem.

## Kody zdarzeń i ich podmioty

Pomiar wszystkich 42 wywołań `AuditLog::record` (34 różne kody). „Podmiot” to model zapisany w
`subject_type`/`subject_id`. „Czyja rzecz” to osoba, do której podmiot należy. „Ładunek” to
klucze `details`, bez wartości.

| Kod | Podmiot | Czyja rzecz | Ładunek |
|---|---|---|---|
| `application.accepted` | zgłoszenie rekrutacyjne (`Application`) | osoba ze zgłoszenia; konto — `applications.user_id` | `application_id`, `decision`, `user_id`, `role` |
| `application.rejected` | zgłoszenie rekrutacyjne | osoba ze zgłoszenia (konta zwykle brak) | `application_id`, `decision` |
| `access.extended` | konto (`User`) | ta osoba | `previous_access_expires_at`, `access_expires_at` |
| `course.created` | kurs (`Course`) | — | `slug`, `is_published` |
| `course.updated` | kurs; przy zmianie kolejności kursów brak podmiotu | — | `op` i jeden z: `lesson_id`, `material_id`, `topic_id`, `course_id`; dawniej także `changed`, `lesson_ids`, `course_ids`, `user_ids` |
| `course.deleted` | kurs (usunięcie miękkie) | — | `slug` |
| `assignment.created` | przypisanie do kursu (`CourseAssignment`) | prowadzący (`instructor_id`) | `course_id`, `lesson_id`, `instructor_id` |
| `assignment.removed` | przypisanie do kursu | prowadzący | `course_id`, `lesson_id`, `instructor_id` |
| `attempt.finished` | podejście do testu (`TestAttempt`) | osoba podchodząca (`user_id`) | `test_id`, `attempt_number`, `score_percent`, `passed` |
| `attempts.reset` | konto | ta osoba | `test_id`, `reason`, `cleared` |
| `workshop.completed` | konto | ta osoba | `edition_id` |
| `internship.accepted` | wpis stażu (`InternshipEntry`) | autor wpisu (`user_id`) | `entry_id` |
| `internship.returned` | wpis stażu | autor wpisu | `entry_id` |
| `internship.rejected` | wpis stażu | autor wpisu | `entry_id` |
| `supervisor.assigned` | przypisanie superwizora (`SupervisorAssignment`) | osoba w programie (`volunteer_id`) | `volunteer_id`, `supervisor_id` |
| `supervision.attendance_marked` | zapis na superwizję (`SupervisionSignup`) | osoba zapisana (`user_id`) | `slot_id`, `user_id`, `attendance_before`, `attendance_after` |
| `supervision.slot_cancelled` | termin superwizji (`SupervisionSlot`) | prowadzący termin (`supervisor_id`) | `slot_id`, `supervisor_id`, `signups_released` |
| `certificate.issued` | certyfikat (`Certificate`) | właściciel (`user_id`) | `number`, `edition_id` |
| `certificate.revoked` | certyfikat | właściciel | `number`, `reason` |
| `document.generated` | dokument (`Document`) | właściciel (`user_id`) | `type`, `number` |
| `sensitive.viewed` | zgłoszenie (skan dyplomu) albo dokument profilu (`ProfileDocument`) | osoba ze zgłoszenia albo właściciel profilu | `file_type`, `file_id` |
| `profile.accepted` | profil psychologa (`PsychologistProfile`) | właściciel (`user_id`) | `profile_id` |
| `profile.returned` | profil psychologa | właściciel | `profile_id` |
| `profile.withdrawn` | profil psychologa | właściciel | `profile_id` |
| `user.created` | konto | ta osoba | `role` |
| `user.updated` | konto | ta osoba | `changed` (nazwy zmienionych pól) |
| `user.blocked` | konto | ta osoba | `reason` |
| `user.anonymized` | konto | ta osoba (już zanonimizowana) | brak |
| `edition.updated` | edycja (`Edition`) | — | `changed` (nazwy kluczy) |
| `legal_document.published` | wersja dokumentu prawnego (`LegalDocumentVersion`) | — | `type`, `version` |
| `legal_document.accepted` | wersja dokumentu prawnego | — (akceptuje wykonawca) | `type`, `version` |
| `notification_settings.updated` | wiersz ustawień (`Setting`) | — | `types`, `supervision_reminder` |
| `cooperation_request.created` | prośba o dalszą współpracę (`CooperationRequest`) | autor (`user_id`) | `request_id` |
| `cooperation_request.answered` | prośba o dalszą współpracę | autor | `request_id`, `status` |

Nazwa typu podmiotu w bazie to pełna nazwa klasy (`App\Models\InternshipEntry`). Projekt nie ma
mapy skrótów typów.

## Pola ładunku z wartościami albo tekstem wpisanym ręcznie

Lista i stary eksport wysyłają `details` w całości. Wartościami danych albo tekstem wpisanym
ręcznie są:

- `reason` w `user.blocked`, `certificate.revoked` i `attempts.reset` — tekst wpisany ręcznie;
- `score_percent` i `passed` w `attempt.finished` — wynik testu;
- `attendance_before` i `attendance_after` w `supervision.attendance_marked` — obecność;
- `previous_access_expires_at` i `access_expires_at` w `access.extended` — daty dostępu;
- `role` w `user.created` i `application.accepted` — rola;
- `number` w `certificate.issued`, `certificate.revoked` i `document.generated` — numer
  dokumentu;
- `types` i `supervision_reminder` w `notification_settings.updated` — wartości ustawień;
- `status` w `cooperation_request.answered`;
- listy identyfikatorów (`user_ids`, `lesson_ids`, `course_ids`) w starszych wpisach
  `course.updated`.

Treści pytań ani danych o zdrowiu żaden kod nie zapisuje do dziennika.

## Wnioski dla nowego ekranu

- Stronicowanie już jest (25 na stronę, najwyżej 100). Problem „najwyżej 100 wierszy” dotyczy
  górnej granicy jednej strony, nie braku stron. Nowy ekran korzysta ze stron i pokazuje licznik.
- Brakuje czytelnego „kogo dotyczy”, grup zdarzeń, filtra po osobie, której wpis dotyczy,
  wyszukiwania po imieniu i nazwisku oraz eksportu w kolumnach ekranu.
- Filtr „Do” gubi wpisy z ostatniego dnia zakresu — do poprawienia razem z nowymi filtrami.
