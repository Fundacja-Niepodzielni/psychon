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

    public function test_an_exhausted_limit_still_answers_403_after_the_window(): void
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

        // Poza oknem i z inną treścią: żadne rozpoznanie powtórki nie ma tu zastosowania,
        // więc limit musi odpowiedzieć sam za siebie.
        $this->travel($this->oknoPowtorzeniaSekund() + 60)->seconds();

        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $this->answersFor($test, 7)])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'attempts_exhausted');

        $this->assertDatabaseCount('test_attempts', 3);
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
