<?php

namespace Tests\Feature\H19;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * S1-11 · kryterium ★ H19.1, część, której nie da się sprawdzić po stronie serwera:
 * **„każdy link z odpowiedzi → 200 we froncie"**.
 *
 * Rozpoznanie mówiło, że dwa z czterech linków prowadzą donikąd. Serwer nie ma jak
 * tego zauważyć — zwraca ścieżkę i jest z siebie zadowolony, a 404 widzi dopiero
 * osoba, która kliknie licznik na pulpicie. To jest **kontrakt między pakietami
 * przechodzący przez granicę repozytorium**, więc kontrola też musi tę granicę przejść.
 *
 * Jak mierzę bez przeglądarki: buduję **spis tras frontu** z plików `page.tsx`
 * w `frontend/app` (Next.js App Router — obecność pliku JEST definicją trasy),
 * odrzucam grupy tras `(nazwa)`, które nie wchodzą do adresu, a segmenty dynamiczne
 * `[param]` traktuję jako dowolny człon. Potem sprawdzam, czy każdy link z API
 * pasuje do którejś trasy.
 *
 * ⚠ Czego ten świadek NIE dowodzi: że strona się renderuje, że rola ma do niej dostęp
 * i że nie rzuca błędu. Dowodzi wyłącznie, że **adres istnieje**. To jest dokładnie
 * ta różnica, o którą chodzi w kryterium — dziś adres NIE istnieje.
 *
 * `php artisan test --filter=DashboardLinks`
 */
class DashboardLinksTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_the_dashboard_returns_exactly_the_agreed_links(): void
    {
        // POŁOWA BACKENDOWA kryterium ★ H19.1. Druga połowa — „czy ten adres ma
        // trasę" — mieszka we froncie (`frontend/app/__tests__/linki-pulpitu.test.ts`),
        // bo tam są pliki tras. Pierwsza wersja robiła obie połowy tutaj i czytała
        // `frontend/app` z kontenera backendu; działało wyłącznie u mnie, bo dołożyłam
        // montowanie do własnego stosu, i **pomijało się po cichu u wszystkich innych**
        // (2 pominięcia w bramce sesji wykonawczej). Kontrola działająca na jednej
        // maszynie jest kontrolą tej maszyny, nie systemu.
        //
        // Obie połowy zazębia TA LISTA: zmiana adresu po stronie serwera zapala ten
        // test, brak trasy zapala tamten. Gdyby front pytał API zamiast trzymać stałą,
        // oba testy sprawdzałyby to samo i rozjazd byłby niewidoczny.
        $adresy = collect($this->kolejkiPulpitu())->pluck('link', 'key')->all();

        $this->assertSame(
            [
                'applications' => '/admin/uczestniczki',
                'internship_entries' => '/admin/staz',
                'profiles' => '/admin/profile',
                'questions' => '/prowadzacy/pytania',
            ],
            $adresy,
            'Zmienił się adres albo klucz kolejki. Jeśli to zamierzone — popraw też stałą '
            .'`LINKI_KOLEJEK` w `frontend/app/__tests__/linki-pulpitu.test.ts`, inaczej front '
            .'przestanie pilnować istnienia tej trasy.',
        );
    }

    public function test_every_queue_entry_has_the_contract_shape(): void
    {
        // Kształt, nie tylko wartości: front rysuje z tych trzech pól i bez któregokolwiek
        // licznik przestaje być klikalny albo pokazuje puste miejsce.
        foreach ($this->kolejkiPulpitu() as $kolejka) {
            $this->assertSame(['key', 'count', 'link'], array_keys($kolejka));
            $this->assertIsInt($kolejka['count']);
            $this->assertStringStartsWith('/', $kolejka['link'], 'Adres kolejki musi być ścieżką bezwzględną.');
        }
    }

    public function test_queue_counts_match_the_seed(): void
    {
        // Liczby wiążące z `07-hackaton/04-seed-demo.md` §5. Link bez właściwej liczby
        // prowadzi wprawdzie na istniejącą stronę, ale mówi nieprawdę o tym, ile tam czeka.
        $kolejki = collect($this->kolejkiPulpitu())->keyBy('key');

        $this->assertSame(1, (int) $kolejki['applications']['count'], 'Zgłoszenia `new` wg seedu: 1.');
        $this->assertSame(2, (int) $kolejki['internship_entries']['count'], 'Wpisy stażu do akceptacji wg seedu: 2.');
        $this->assertSame(0, (int) $kolejki['profiles']['count'], 'Profile do decyzji wg seedu: 0 (draft oli się nie liczy).');
        $this->assertSame(1, (int) $kolejki['questions']['count'], 'Pytania bez odpowiedzi wg seedu: 1.');
    }

    /** @return list<array{key: string, count: int, link: string}> */
    private function kolejkiPulpitu(): array
    {
        Sanctum::actingAs(User::where('email', 'admin@demo.pl')->firstOrFail());

        return $this->getJson('/api/v1/admin/dashboard')->assertOk()->json('data.queues');
    }
}
