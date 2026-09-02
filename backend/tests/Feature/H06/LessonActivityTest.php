<?php

namespace Tests\Feature\H06;

use App\Models\LessonProgress;

/**
 * H06 · kryterium ★2 — „Karta w tle nie zwiększa `active_seconds`; dwie karty
 * naraz nie liczą podwójnie (test: dwa heartbeaty w tej samej sekundzie →
 * przyrost ≤35 s)".
 *
 * ⚠ ROZJAZD KRYTERIUM Z KONTRAKTEM, zgłoszony osobno plikiem w kanale.
 * Karta wymaga, żeby DWA heartbeaty w tej samej sekundzie dały łączny przyrost
 * ≤ 35 s. Kontrakt (§ Postęp lekcji) mówi, że przycinanie do 35 s jest
 * „na żądanie" — przy takim odczycie dwa żądania po 30 s dają 60 s i kryterium
 * karty jest niespełnialne. Świadkowie poniżej mierzą OBA odczyty osobno:
 * `…_per_request` (kontrakt) i `…_two_tabs` (kryterium ★ karty).
 *
 * `php artisan test --filter=LessonActivity`
 */
class LessonActivityTest extends LessonPackageCase
{
    public function test_background_tab_does_not_grow_active_seconds(): void
    {
        $marta = $this->actingAsMarta();
        $lesson = $this->untouchedLesson();

        // Karta w tle: wideo leci (watched rośnie), uwaga nie (active = 0).
        $this->heartbeat($lesson, ['position_seconds' => 30, 'watched_delta' => 30, 'active_delta' => 0])->assertOk();
        $this->heartbeat($lesson, ['position_seconds' => 60, 'watched_delta' => 30, 'active_delta' => 0])->assertOk();

        $progress = LessonProgress::where('user_id', $marta->id)
            ->where('lesson_id', $lesson->id)
            ->firstOrFail();

        $this->assertSame(0, (int) $progress->active_seconds, 'Karta w tle doliczyła czas aktywny.');
        $this->assertSame(60, (int) $progress->watched_seconds, 'Czas obejrzany powinien rosnąć mimo tła.');
    }

    public function test_a_single_request_is_trimmed_to_thirty_five_seconds(): void
    {
        // Odczyt KONTRAKTOWY: przycinanie „na żądanie".
        $marta = $this->actingAsMarta();
        $lesson = $this->untouchedLesson();

        $this->heartbeat($lesson, ['position_seconds' => 600, 'watched_delta' => 600, 'active_delta' => 600])->assertOk();

        $progress = LessonProgress::where('user_id', $marta->id)
            ->where('lesson_id', $lesson->id)
            ->firstOrFail();

        $this->assertSame(
            35,
            (int) $progress->active_seconds,
            'Pojedyncze żądanie z wielkim `active_delta` nie zostało przycięte do 35 s.',
        );
    }

    public function test_two_tabs_in_the_same_second_do_not_count_twice(): void
    {
        // Odczyt KRYTERIUM ★ karty H06.2 — ostrzejszy niż kontraktowy.
        // Dwie karty tej samej osoby, ta sama sekunda, ten sam odcinek nagrania.
        $marta = $this->actingAsMarta();
        $lesson = $this->untouchedLesson();

        $this->travelTo(now()->startOfSecond());

        $this->heartbeat($lesson, ['position_seconds' => 30, 'watched_delta' => 30, 'active_delta' => 30])->assertOk();
        $this->heartbeat($lesson, ['position_seconds' => 30, 'watched_delta' => 30, 'active_delta' => 30])->assertOk();

        $progress = LessonProgress::where('user_id', $marta->id)
            ->where('lesson_id', $lesson->id)
            ->firstOrFail();

        $this->assertLessThanOrEqual(
            35,
            (int) $progress->active_seconds,
            'Dwie karty naraz doliczyły czas aktywny podwójnie — rzetelność nauki (H07) liczy się z tej wartości.',
        );
    }

    public function test_counters_never_decrease(): void
    {
        // Kryterium ★3, druga połowa: „wartości nigdy nie maleją".
        $marta = $this->actingAsMarta();
        $lesson = $this->untouchedLesson();

        $this->heartbeat($lesson, ['position_seconds' => 300, 'watched_delta' => 300, 'active_delta' => 30])->assertOk();

        $przed = LessonProgress::where('user_id', $marta->id)->where('lesson_id', $lesson->id)->firstOrFail();

        // Cofnięcie się w nagraniu NIE jest podstawą do obniżenia liczników.
        $this->heartbeat($lesson, ['position_seconds' => 10, 'watched_delta' => 0, 'active_delta' => 0])->assertOk();

        $po = LessonProgress::where('user_id', $marta->id)->where('lesson_id', $lesson->id)->firstOrFail();

        $this->assertGreaterThanOrEqual((int) $przed->watched_seconds, (int) $po->watched_seconds);
        $this->assertGreaterThanOrEqual((int) $przed->active_seconds, (int) $po->active_seconds);
    }

    public function test_negative_delta_is_rejected(): void
    {
        // KONTROLA NEGATYWNA reguły „tylko rosną": bez niej wystarczyłoby, żeby
        // serwer PRZYJMOWAŁ ujemny przyrost i po cichu go ignorował — a wtedy
        // klient nie dowiaduje się, że wysłał bzdurę.
        $this->actingAsMarta();

        $this->heartbeat($this->untouchedLesson(), [
            'position_seconds' => 30,
            'watched_delta' => -30,
            'active_delta' => 10,
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_both_delta_fields_are_required(): void
    {
        // Kontrakt: „Oba pola są wymaganymi, nieujemnymi liczbami całkowitymi".
        $this->actingAsMarta();
        $lesson = $this->untouchedLesson();

        $this->heartbeat($lesson, ['position_seconds' => 30, 'active_delta' => 10])
            ->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');

        $this->heartbeat($lesson, ['position_seconds' => 30, 'watched_delta' => 10])
            ->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
    }
}
