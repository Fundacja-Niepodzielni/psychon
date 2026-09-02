<?php

namespace Tests\Feature\H19;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
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

    public function test_every_queue_link_points_to_an_existing_front_route(): void
    {
        $trasy = $this->trasyFrontu();

        $this->assertNotEmpty(
            $trasy,
            'Nie znalazłam ŻADNEJ trasy frontu — kontrola nie ma czego mierzyć i byłaby pustym pomiarem.',
        );

        $kolejki = $this->kolejkiPulpitu();

        $this->assertNotEmpty($kolejki, 'Pulpit nie zwrócił żadnej kolejki.');

        $bezTrasy = [];

        foreach ($kolejki as $kolejka) {
            if (! $this->trasaIstnieje($kolejka['link'], $trasy)) {
                $bezTrasy[] = $kolejka['key'].' → '.$kolejka['link'];
            }
        }

        $this->assertSame(
            [],
            $bezTrasy,
            "Linki kolejek prowadzące donikąd:\n  ".implode("\n  ", $bezTrasy)
            ."\nZnane trasy frontu:\n  ".implode("\n  ", $trasy),
        );
    }

    public function test_the_route_inventory_rejects_an_address_that_does_not_exist(): void
    {
        // KONTROLA NEGATYWNA SAMEGO PRZYRZĄDU. Gdyby dopasowanie było zbyt luźne
        // (np. traktowało segment dynamiczny jako „cokolwiek, także nic"), test wyżej
        // byłby zielony ZAWSZE i nie zauważyłby żadnego zepsutego linku.
        $trasy = $this->trasyFrontu();

        $this->assertFalse(
            $this->trasaIstnieje('/admin/nie-ma-takiej-strony', $trasy),
            'Przyrząd uznał nieistniejący adres za istniejący — dopasowanie jest za luźne.',
        );

        $this->assertTrue(
            $this->trasaIstnieje('/admin/staz', $trasy),
            'Przyrząd nie rozpoznał adresu, który na pewno istnieje — dopasowanie jest za ciasne.',
        );
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

    /**
     * Spis tras frontu z plików `page.tsx` (Next.js App Router).
     *
     * @return list<string>
     */
    private function trasyFrontu(): array
    {
        $katalog = base_path('../frontend/app');

        if (! is_dir($katalog)) {
            $this->markTestSkipped('Brak katalogu `frontend/app` — nie ma z czego zbudować spisu tras.');
        }

        $trasy = [];

        foreach (File::allFiles($katalog) as $plik) {
            if ($plik->getFilename() !== 'page.tsx') {
                continue;
            }

            $sciezka = str_replace('\\', '/', $plik->getRelativePath());

            // Grupy tras `(uczestnik)` porządkują pliki, ale NIE wchodzą do adresu.
            $segmenty = array_values(array_filter(
                explode('/', $sciezka),
                static fn (string $segment): bool => $segment !== '' && ! str_starts_with($segment, '('),
            ));

            $trasy[] = '/'.implode('/', $segmenty);
        }

        sort($trasy);

        return array_values(array_unique($trasy));
    }

    /** @param  list<string>  $trasy */
    private function trasaIstnieje(string $link, array $trasy): bool
    {
        $sciezka = rtrim(parse_url($link, PHP_URL_PATH) ?: $link, '/');
        $sciezka = $sciezka === '' ? '/' : $sciezka;

        foreach ($trasy as $trasa) {
            // Segment dynamiczny `[id]` pasuje do dokładnie JEDNEGO członu adresu —
            // nie do dowolnej reszty. Inaczej `/admin/[x]` łapałoby wszystko.
            $wzorzec = '#^'.preg_replace('/\\\\\[[^\\]]+\\\\\]/', '[^/]+', preg_quote($trasa, '#')).'$#';

            if (preg_match($wzorzec, $sciezka) === 1) {
                return true;
            }
        }

        return false;
    }
}
