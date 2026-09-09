/**
 * Prawdziwy kształt odpowiedzi `GET /admin/supervision/slots` (H12).
 *
 * Skąd wzięty: `backend/app/Http/Resources/H12/InstructorSlotResource.php`
 * (pola per termin i zapis) oraz
 * `backend/app/Http/Controllers/Api/V1/H12/AdminSupervisionController::index`
 * (koperta odpowiedzi — WYŁĄCZNIE klucz `data`, bez `meta`; kontroler nie
 * paginuje, więc `meta` nigdy nie istnieje).
 *
 * Czym się odświeża: gdy zmieni się `toArray()` w zasobie albo koperta w
 * kontrolerze, przepisać ręcznie te dwa pliki (tylko do odczytu z roli TESTY)
 * i zaktualizować fixture — najlepiej porównując `php artisan route:list` +
 * ręczne wywołanie endpointu albo test backendowy `AdminSupervisionControllerTest`,
 * jeśli istnieje.
 *
 * Zawiera: dwóch różnych prowadzących (`supervisor.first_name`/`last_name`,
 * NIE `supervisor.name`) i jedną obecność `attendance: "present"`.
 */

export function dwaTerminyPrawdziwyKsztalt(attendance: "present" | "absent" | null) {
  return {
    data: [
      {
        id: 1,
        starts_at: "2026-09-10T09:00:00Z",
        duration_minutes: 60,
        seats_limit: 6,
        location_or_link: "https://przyklad.test/superwizja-1",
        supervisor: { id: 10, first_name: "Agata", last_name: "Pierwsza" },
        active_signups_count: 1,
        available_seats: 5,
        signups: [
          {
            user: { id: 100, first_name: "Osoba", last_name: "Jedna" },
            signed_up_at: "2026-09-08T10:00:00Z",
            attendance: null,
          },
        ],
      },
      {
        id: 2,
        starts_at: "2026-09-12T09:00:00Z",
        duration_minutes: 60,
        seats_limit: 6,
        location_or_link: "https://przyklad.test/superwizja-2",
        supervisor: { id: 20, first_name: "Bartek", last_name: "Drugi" },
        active_signups_count: 1,
        available_seats: 5,
        signups: [
          {
            user: { id: 200, first_name: "Osoba", last_name: "Dwa" },
            signed_up_at: "2026-09-08T10:00:00Z",
            attendance,
          },
        ],
      },
    ],
  };
}
