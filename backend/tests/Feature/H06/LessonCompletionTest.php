<?php

namespace Tests\Feature\H06;

use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Support\Settings;

/**
 * H06 · kryterium ★3 („`complete` poniżej progu → 422 `not_enough_active_time`")
 * i kryterium 4 („zmiana progu w ustawieniach edycji zmienia `completable_at_percent`
 * bez wdrożenia").
 *
 * Próg pochodzi z `editions.lesson_completion_percent` (kontrakt §3.3, seed: 60).
 *
 * `php artisan test --filter=LessonCompletion`
 */
class LessonCompletionTest extends LessonPackageCase
{
    public function test_completing_below_the_threshold_is_refused(): void
    {
        $this->actingAsMarta();
        $lesson = $this->untouchedLesson();

        // Jeden heartbeat = najwyżej 35 s aktywności; próg to 60% długości lekcji.
        $this->heartbeat($lesson, ['position_seconds' => 35, 'watched_delta' => 35, 'active_delta' => 35])->assertOk();

        $this->postJson("/api/v1/lessons/{$lesson->id}/complete")
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'not_enough_active_time');
    }

    public function test_completing_above_the_threshold_succeeds(): void
    {
        // KONTROLA POZYTYWNA do powyższej. Odmowa, która przychodzi ZAWSZE,
        // nie jest kontrolą progu — jest awarią trasy.
        $this->actingAsMarta();
        $lesson = $this->untouchedLesson();

        $this->accumulateActiveSeconds($lesson, (int) ceil($lesson->duration_seconds * 0.61));

        $data = $this->postJson("/api/v1/lessons/{$lesson->id}/complete")->assertOk()->json('data');

        $this->assertTrue($data['is_completed']);
        $this->assertNotNull($data['completed_at'] ?? null, 'Kontrakt wymaga `completed_at` w ciele sukcesu.');
    }

    public function test_the_threshold_comes_from_edition_settings_not_from_code(): void
    {
        // Kryterium 4: zmiana progu w ustawieniach edycji ma zmienić wynik
        // BEZ wdrożenia. Próg zaszyty w kodzie przeszedłby test „poniżej progu → 422",
        // a ten by go złapał.
        $this->actingAsMarta();
        $lesson = $this->untouchedLesson();

        $przed = (int) $this->showLesson($lesson)->assertOk()->json('data.completable_at_percent');
        $this->assertSame(60, $przed, 'Seed deklaruje próg 60% (04-seed-demo §1).');

        $edition = Settings::activeEdition();
        $edition->forceFill(['lesson_completion_percent' => 25])->save();

        $po = (int) $this->showLesson($lesson)->assertOk()->json('data.completable_at_percent');

        $this->assertSame(25, $po, 'Zmiana progu w edycji nie dotarła do odpowiedzi — próg jest zaszyty poza ustawieniami.');
    }

    public function test_lowering_the_threshold_makes_the_same_progress_completable(): void
    {
        // Ten sam postęp, dwa progi, dwa różne werdykty — to jest dowód, że próg
        // DZIAŁA, a nie tylko że jest wypisywany w odpowiedzi.
        $this->actingAsMarta();
        $lesson = $this->untouchedLesson();

        $this->accumulateActiveSeconds($lesson, (int) ceil($lesson->duration_seconds * 0.30));

        $this->postJson("/api/v1/lessons/{$lesson->id}/complete")
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'not_enough_active_time');

        Settings::activeEdition()->forceFill(['lesson_completion_percent' => 25])->save();

        $this->postJson("/api/v1/lessons/{$lesson->id}/complete")->assertOk();
    }

    public function test_a_lesson_with_zero_duration_is_never_completable(): void
    {
        // Kontrakt, zdanie ostatnie sekcji: „Lekcja z `duration_seconds = 0` nigdy
        // nie jest `completable`; próba ukończenia również zwraca 422".
        // Bez tego świadka dzielenie przez zero potrafi dać `completable: true`
        // i lekcję „ukończoną" bez jednej sekundy oglądania.
        $this->actingAsMarta();

        $lesson = $this->untouchedLesson();
        $lesson->forceFill(['duration_seconds' => 0])->save();

        $this->assertFalse((bool) $this->showLesson($lesson)->assertOk()->json('data.completable'));

        $this->postJson("/api/v1/lessons/{$lesson->id}/complete")
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'not_enough_active_time');
    }

    public function test_reading_a_lesson_increments_its_open_counter(): void
    {
        // Aneks kontraktu H1 (PRZYJĘTY): „każdy udany odczyt zwiększa `open_count` o 1”.
        // Efekt uboczny na GET jest wyjątkiem projektowym H06/H07 — świadek pilnuje,
        // żeby wyjątek naprawdę działał, skoro został dopuszczony.
        $marta = $this->actingAsMarta();
        $lesson = $this->untouchedLesson();

        // `open_count` stoi na `lesson_progress`, nie na `lessons` — licznik jest
        // per uczestniczka, nie globalny dla lekcji.
        $licznik = fn (): int => (int) (LessonProgress::where('user_id', $marta->id)
            ->where('lesson_id', $lesson->id)
            ->value('open_count') ?? 0);

        $przed = $licznik();

        $this->showLesson($lesson)->assertOk();
        $this->showLesson($lesson)->assertOk();

        $this->assertSame($przed + 2, $licznik());
    }

    /**
     * Doprowadza `active_seconds` do zadanej wartości heartbeatami po 35 s.
     *
     * ⚠ Zegar MUSI iść razem z nimi. Serwer przycina `active_delta` nie tylko do
     * 35 s na żądanie (kontrakt), ale też do liczby sekund, które NAPRAWDĘ upłynęły
     * od poprzedniego heartbeatu. To reguła ostrzejsza niż kontraktowa i to ona
     * realizuje kryterium ★ H06.2 („dwie karty naraz nie liczą podwójnie").
     * Pierwsza wersja tego pomocnika strzelała 32 heartbeatami w tej samej sekundzie
     * i doliczała 35 s zamiast 1098 — czerwień była wadą przyrządu, nie produktu.
     */
    private function accumulateActiveSeconds(Lesson $lesson, int $target): void
    {
        $accumulated = 0;

        while ($accumulated < $target) {
            $step = min(35, $target - $accumulated);
            $accumulated += $step;

            $this->heartbeat($lesson, [
                'position_seconds' => $accumulated,
                'watched_delta' => $step,
                'active_delta' => $step,
            ])->assertOk();

            $this->travel($step)->seconds();
        }
    }
}
