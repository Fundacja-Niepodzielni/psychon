<?php

namespace Tests\Feature\H06;

use App\Models\Course;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Wspólne fixture'y pakietu H06 (postęp lekcji).
 *
 * Świadkowie tego pakietu są pisani Z KRYTERIÓW karty H06 i z kontraktu Fundacji
 * (`07-hackaton/01-pakiety-zadan.md`, `07-hackaton/02-kontrakt-api.md`), nie z kodu
 * wykonawcy. Część z nich jest CZERWONA w chwili napisania — i to jest ich dowód
 * przydatności: świadek, który od pierwszego przebiegu świeci na zielono, nie
 * odróżnia systemu naprawionego od niesprawdzonego.
 *
 * Stan bazowy: `DemoSeeder` (`07-hackaton/04-seed-demo.md`) — marta ma kurs 2
 * `in_progress` 40% (2 z 5 lekcji), więc lekcja 3 tego kursu jest nietknięta.
 */
abstract class LessonPackageCase extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    protected function marta(): User
    {
        return User::where('email', 'marta@demo.pl')->firstOrFail();
    }

    /** Lekcja odblokowana i NIETKNIĘTA — licznik startuje z zera, więc przyrosty są mierzalne. */
    protected function untouchedLesson(): Lesson
    {
        $course = Course::where('slug', 'wywiad-psychologiczny')->firstOrFail();

        return $course->lessons()->orderBy('sequence_order')->skip(2)->firstOrFail();
    }

    protected function actingAsMarta(): User
    {
        $marta = $this->marta();
        Sanctum::actingAs($marta);

        return $marta;
    }

    /** Heartbeat w brzmieniu kontraktu (§ Postęp lekcji): trzy pola, nazwy wiążące. */
    protected function heartbeat(Lesson $lesson, array $body): \Illuminate\Testing\TestResponse
    {
        return $this->postJson("/api/v1/lessons/{$lesson->id}/progress", $body);
    }

    protected function showLesson(Lesson $lesson): \Illuminate\Testing\TestResponse
    {
        return $this->getJson("/api/v1/lessons/{$lesson->id}");
    }
}
