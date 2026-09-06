<?php

namespace Tests\Feature\H10;

use App\Models\TestAttempt;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Arr;
use Laravel\Sanctum\Sanctum;

/**
 * Pakiet H10 · podwójna wysyłka testu — kryterium właściciela.
 *
 * Dwie wysyłki TEGO SAMEGO podejścia w tym samym oknie mają kosztować JEDNO
 * podejście, a druga odpowiedź ma oddać wynik pierwszej. Rzecz dzieje się na
 * poziomie API, nie w interfejsie: podwójne kliknięcie „wyślij test" dociera
 * dwoma żądaniami i uczestniczka nie ma jak cofnąć zjedzonego podejścia.
 *
 * Świadkowie są pisani z kryterium, nie z implementacji zabezpieczenia — dlatego
 * nie sprawdzają ŻADNEGO wewnętrznego mechanizmu (klucza, blokady, kolumny),
 * tylko to, co widzi wysyłający: liczbę podejść w bazie i treść odpowiedzi.
 */
class DuplicateSubmissionTest extends TestPackageCase
{
    use RefreshDatabase;

    /**
     * Okno przyjęte, gdy konfiguracja go nie publikuje.
     *
     * Kryterium mówi o „tym samym oknie", czyli o czasie jednego podwójnego
     * kliknięcia, nie o godzinach. Trzydzieści sekund jest wartością przyjętą
     * przez świadka na czas, gdy okna nie da się odczytać z konfiguracji.
     */
    private const DOMYSLNE_OKNO_SEKUND = 30;

    public function test_the_same_submission_sent_twice_costs_one_attempt(): void
    {
        $test = $this->makeTest(questions: 10);
        Sanctum::actingAs($this->volunteer());

        $odpowiedzi = $this->answersFor($test, 9); // 90% — wynik rozpoznawalny w odpowiedzi

        $pierwsza = $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $odpowiedzi]);
        $pierwsza->assertCreated();

        $podejscie = TestAttempt::query()->sole();

        $druga = $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $odpowiedzi]);
        $druga->assertSuccessful();

        $this->assertSame(
            $pierwsza->json('data.attempt_number'),
            $druga->json('data.attempt_number'),
            sprintf(
                'Druga wysyłka tych samych odpowiedzi ma oddać wynik PIERWSZEGO podejścia, '
                .'a oddała nowe. Pierwsza odpowiedź: podejście nr %s, druga odpowiedź: podejście nr %s. '
                .'Dla uczestniczki znaczy to, że podwójne kliknięcie „wyślij test" zjadło dwa z trzech podejść.',
                var_export($pierwsza->json('data.attempt_number'), true),
                var_export($druga->json('data.attempt_number'), true),
            ),
        );

        $this->assertSame(
            $pierwsza->json('data.score_percent'),
            $druga->json('data.score_percent'),
            'Druga wysyłka ma oddać wynik pierwszego podejścia, nie policzyć własnego.',
        );
        $this->assertSame($pierwsza->json('data.passed'), $druga->json('data.passed'));

        $this->assertDatabaseCount('test_attempts', 1);
        $this->assertSame(
            $podejscie->id,
            TestAttempt::query()->sole()->id,
            'W bazie ma zostać dokładnie to podejście, które utworzyła pierwsza wysyłka.',
        );

        $this->getJson("/api/v1/tests/{$test->id}/attempts")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_a_genuine_second_attempt_with_different_answers_is_still_recorded(): void
    {
        $test = $this->makeTest(questions: 10);
        Sanctum::actingAs($this->volunteer());

        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $this->answersFor($test, 3)])
            ->assertCreated()
            ->assertJsonPath('data.attempt_number', 1);

        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $this->answersFor($test, 9)])
            ->assertCreated()
            ->assertJsonPath('data.attempt_number', 2)
            ->assertJsonPath('data.score_percent', 90);

        $this->assertDatabaseCount('test_attempts', 2);
    }

    public function test_the_same_answers_sent_after_the_window_are_a_new_attempt(): void
    {
        $test = $this->makeTest(questions: 10);
        Sanctum::actingAs($this->volunteer());

        $odpowiedzi = $this->answersFor($test, 4);

        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $odpowiedzi])
            ->assertCreated()
            ->assertJsonPath('data.attempt_number', 1);

        $this->travel($this->oknoPowtorzeniaSekund() + 60)->seconds();

        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $odpowiedzi])
            ->assertCreated()
            ->assertJsonPath('data.attempt_number', 2);

        $this->assertDatabaseCount('test_attempts', 2);
    }

    /**
     * Tematem jest NOWE zgłoszenie przy wyczerpanym limicie — nie „każde".
     *
     * Powtórzenie ostatniego podejścia dostaje wynik, a nie 403; mierzy to leg poniżej.
     * Tu chodzi o zgłoszenie, którego wcześniej nie było: ono ma zostać zatrzymane,
     * i to niezależnie od okna powtórzenia.
     */
    public function test_a_new_submission_at_the_exhausted_limit_answers_403(): void
    {
        $test = $this->makeTest(questions: 10);
        Sanctum::actingAs($this->volunteer());

        // Trzy RÓŻNE zestawy odpowiedzi — żeby wyczerpanie limitu było prawdziwe,
        // a nie skutkiem uznania powtórki za nowe podejście.
        foreach ([2, 3, 4] as $numer => $poprawne) {
            $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $this->answersFor($test, $poprawne)])
                ->assertCreated()
                ->assertJsonPath('data.attempt_number', $numer + 1);
        }

        // Czwarte zgłoszenie ma INNĄ treść niż każde z trzech, więc jest nowe, a nie
        // powtórzone — i jest nowe także wtedy, gdy okno powtórzenia dawno minęło.
        // Przesunięcie zegara odbiera odpowiedzi 403 ostatnią wymówkę.
        $this->travel($this->oknoPowtorzeniaSekund() + 60)->seconds();

        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $this->answersFor($test, 7)])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'attempts_exhausted');

        $this->assertDatabaseCount('test_attempts', 3);
    }

    /**
     * Dwuklik na OSTATNIM podejściu: uczestniczka dostaje swój wynik dwa razy,
     * a nie „wykorzystałeś wszystkie podejścia".
     *
     * To jest chwila, w której wynik znaczy najwięcej — ostatnia szansa, przycisk
     * kliknięty dwa razy z nerwów albo z powodu wolnej sieci. Drugie kliknięcie ma
     * oddać ten sam numer podejścia i ten sam wynik, a licznik zużytych podejść ma
     * DOJŚĆ do limitu i się na nim zatrzymać.
     */
    public function test_a_double_click_on_the_last_attempt_answers_with_the_result(): void
    {
        $test = $this->makeTest(questions: 10);
        Sanctum::actingAs($this->volunteer());

        $limit = $this->getJson("/api/v1/courses/{$test->course->slug}/test")
            ->assertOk()
            ->json('data.attempts_limit');

        $this->assertGreaterThanOrEqual(
            2,
            $limit,
            'Świadek potrzebuje limitu co najmniej 2, żeby w ogóle istniało podejście PRZED ostatnim.',
        );

        // Wszystkie podejścia PRZED ostatnim, każde z własnym zestawem odpowiedzi.
        for ($nr = 1; $nr < $limit; $nr++) {
            $this->postJson("/api/v1/tests/{$test->id}/attempts", [
                'answers' => $this->answersForAttempt($test, 2, $nr),
            ])->assertCreated()->assertJsonPath('data.attempt_number', $nr);
        }

        // OSTATNIE podejście — i podwójne kliknięcie w „wyślij test".
        $odpowiedzi = $this->answersFor($test, 9); // 90% — wynik rozpoznawalny w odpowiedzi

        $pierwsza = $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $odpowiedzi]);
        $pierwsza->assertCreated()->assertJsonPath('data.attempt_number', $limit);

        $druga = $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $odpowiedzi]);

        $this->assertNotSame(
            403,
            $druga->getStatusCode(),
            'Drugie kliknięcie na ostatnim podejściu dostało „wykorzystałeś wszystkie podejścia" '
            .'zamiast wyniku, który przed chwilą policzono.',
        );
        $druga->assertSuccessful();

        $this->assertSame(
            $limit,
            $druga->json('data.attempt_number'),
            sprintf(
                'Drugie kliknięcie ma oddać wynik TEGO SAMEGO, ostatniego podejścia (nr %s), a oddało nr %s.',
                var_export($limit, true),
                var_export($druga->json('data.attempt_number'), true),
            ),
        );
        $this->assertSame(
            $pierwsza->json('data.score_percent'),
            $druga->json('data.score_percent'),
            'Drugie kliknięcie ma oddać wynik pierwszego wysłania, nie policzyć własnego.',
        );
        $this->assertSame($pierwsza->json('data.passed'), $druga->json('data.passed'));

        // Licznik DOCHODZI do limitu i go nie przekracza — dwuklik nie zjada nic ponad.
        $this->assertDatabaseCount('test_attempts', $limit);
        $this->getJson("/api/v1/courses/{$test->course->slug}/test")
            ->assertOk()
            ->assertJsonPath('data.attempts_used', $limit);
    }

    /**
     * Okno powtórzenia odczytane z konfiguracji, jeśli jest tam opublikowane.
     *
     * Świadek nie zna nazwy klucza z implementacji (i znać jej nie ma): bierze
     * pierwszą liczbową pozycję konfiguracji, której nazwa mówi o oknie powtórzenia.
     * Gdy takiej nie ma, wraca do wartości domyślnej — świadek ma być czytelny
     * także wtedy, gdy okno jeszcze nie jest konfigurowalne.
     */
    private function oknoPowtorzeniaSekund(): int
    {
        foreach (Arr::dot(config()->all()) as $klucz => $wartosc) {
            if (! is_numeric($wartosc)) {
                continue;
            }

            if (preg_match('/(duplicate|idempot|resubmit|repeat|double).*(window|seconds|ttl)/i', (string) $klucz) === 1) {
                return (int) $wartosc;
            }
        }

        return self::DOMYSLNE_OKNO_SEKUND;
    }
}
