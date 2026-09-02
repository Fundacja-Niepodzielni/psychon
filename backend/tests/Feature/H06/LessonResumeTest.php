<?php

namespace Tests\Feature\H06;

use App\Models\LessonProgress;
use Laravel\Sanctum\Sanctum;

/**
 * H06 · kryterium ★1 — „Wylogowanie i powrót → wznowienie od pozycji (±30 s)".
 *
 * Pole `position_seconds` jest w kontrakcie Fundacji (`02-kontrakt-api.md`,
 * § Postęp lekcji, ciało heartbeatu). Dewiacja D4, która je z forka usunęła,
 * została ODRZUCONA (`18-rozstrzygniecia-dewiacji.md`; `ANEKS-KONTRAKTU-MAPA` H2 —
 * „NIE NANOSIĆ"). Kryterium obowiązuje w brzmieniu Fundacji.
 *
 * ⚠ Ten plik ma być CZERWONY, dopóki pozycja S1-1 nie wejdzie. Czerwień jest tu
 * pomiarem luki, nie awarią świadka.
 *
 * `php artisan test --filter=LessonResume`
 */
class LessonResumeTest extends LessonPackageCase
{
    public function test_heartbeat_stores_the_playback_position_in_the_database(): void
    {
        $marta = $this->actingAsMarta();
        $lesson = $this->untouchedLesson();

        $this->heartbeat($lesson, [
            'position_seconds' => 1234,
            'watched_delta' => 28,
            'active_delta' => 25,
        ])->assertOk();

        // Kryterium = wywołanie API PLUS skutek w bazie. Sama odpowiedź 200
        // dowodzi tylko tego, że trasa istnieje.
        $progress = LessonProgress::where('user_id', $marta->id)
            ->where('lesson_id', $lesson->id)
            ->first();

        $this->assertNotNull($progress, 'Heartbeat nie zapisał żadnego wiersza postępu.');
        $this->assertSame(
            1234,
            (int) $progress->position_seconds,
            'Pozycja odtwarzania nie wylądowała w bazie — wznowienia nie ma z czego odtworzyć.',
        );
    }

    public function test_lesson_returns_the_stored_position_after_a_new_session(): void
    {
        $marta = $this->actingAsMarta();
        $lesson = $this->untouchedLesson();

        $this->heartbeat($lesson, [
            'position_seconds' => 1234,
            'watched_delta' => 28,
            'active_delta' => 25,
        ])->assertOk();

        // „Wylogowanie i powrót": nowe uwierzytelnienie, ta sama osoba.
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($marta);

        $position = (int) $this->showLesson($lesson)->assertOk()->json('data.position_seconds');

        $this->assertEqualsWithDelta(
            1234,
            $position,
            30,
            'Odtwarzacz wznowiłby poza tolerancją ±30 s wymaganą przez kryterium ★ H06.1.',
        );
    }

    public function test_position_may_decrease_because_rewinding_is_allowed(): void
    {
        // Świadek granicy, którą łatwo przekroczyć „naprawiając": `watched_seconds`
        // i `active_seconds` nigdy nie maleją, ale POZYCJA maleć musi — inaczej
        // przewinięcie wstecz byłoby niemożliwe. Reguła „tylko rosną" zastosowana
        // do pozycji jest błędem, nie ostrożnością.
        $marta = $this->actingAsMarta();
        $lesson = $this->untouchedLesson();

        $this->heartbeat($lesson, ['position_seconds' => 900, 'watched_delta' => 30, 'active_delta' => 30])->assertOk();
        $this->heartbeat($lesson, ['position_seconds' => 120, 'watched_delta' => 0, 'active_delta' => 0])->assertOk();

        $progress = LessonProgress::where('user_id', $marta->id)
            ->where('lesson_id', $lesson->id)
            ->firstOrFail();

        $this->assertSame(120, (int) $progress->position_seconds, 'Przewinięcie wstecz nie zostało zapisane.');
    }

    public function test_lesson_without_progress_reports_position_zero(): void
    {
        // Kontrakt: „przy braku postępu liczniki mają wartość 0".
        $this->actingAsMarta();

        $data = $this->showLesson($this->untouchedLesson())->assertOk()->json('data');

        $this->assertSame(0, (int) ($data['position_seconds'] ?? -1));
        $this->assertSame(0, (int) $data['watched_seconds']);
        $this->assertSame(0, (int) $data['active_seconds']);
        $this->assertFalse($data['is_completed']);
    }

    public function test_negative_position_is_rejected(): void
    {
        // KONTROLA NEGATYWNA. Bez niej „zapisuje pozycję" spełniłby też serwer,
        // który zapisuje DOWOLNĄ liczbę, w tym niemożliwą.
        $this->actingAsMarta();

        $this->heartbeat($this->untouchedLesson(), [
            'position_seconds' => -5,
            'watched_delta' => 10,
            'active_delta' => 10,
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
    }
}
