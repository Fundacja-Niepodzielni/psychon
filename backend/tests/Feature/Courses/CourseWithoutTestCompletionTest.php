<?php

namespace Tests\Feature\Courses;

use App\Models\Course;
use App\Models\Edition;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Kurs bez testu jest ukończony w chwili ukończenia ostatniej lekcji i wtedy
 * odblokowuje następny kurs ścieżki — mierzone na trasach, którymi czyta to
 * uczestnik (`GET /courses`, `GET /courses/{slug}`, `GET /lessons/{id}`).
 */
class CourseWithoutTestCompletionTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_course_without_a_test_is_completed_by_its_last_lesson_and_unlocks_the_next_course(): void
    {
        Http::fake();
        [$first, $firstLessons] = $this->courseWithoutTest(1, 2);
        [$second, $secondLessons] = $this->courseWithoutTest(2, 1);
        $this->actingAs(User::factory()->create(['role' => 'volunteer', 'product_group' => 'psychon']), 'keycloak');

        $this->getJson("/api/v1/courses/{$first->slug}")->assertOk()->assertJsonPath('data.has_test', false);

        $statuses = $this->statuses();
        $this->assertSame('in_progress', $statuses[$first->slug]);
        $this->assertSame('locked', $statuses[$second->slug]);
        $this->getJson("/api/v1/courses/{$second->slug}")->assertStatus(403)->assertJsonPath('error.code', 'course_locked');

        // Ukończenie pierwszej z dwóch lekcji niczego jeszcze nie odblokowuje.
        $this->postJson("/api/v1/lessons/{$firstLessons[0]->id}/complete")->assertOk();
        $statuses = $this->statuses();
        $this->assertSame('in_progress', $statuses[$first->slug]);
        $this->assertSame('locked', $statuses[$second->slug]);
        $this->getJson("/api/v1/lessons/{$secondLessons[0]->id}")->assertStatus(403)->assertJsonPath('error.code', 'course_locked');

        // Ostatnia lekcja kończy kurs bez testu i odblokowuje następny kurs ścieżki.
        $this->postJson("/api/v1/lessons/{$firstLessons[1]->id}/complete")->assertOk();
        $statuses = $this->statuses();
        $this->assertSame('completed', $statuses[$first->slug]);
        $this->assertSame('in_progress', $statuses[$second->slug]);

        $this->getJson("/api/v1/courses/{$first->slug}")->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.has_test', false);
        $this->getJson("/api/v1/courses/{$second->slug}")->assertOk()->assertJsonPath('data.status', 'in_progress');
        $this->getJson("/api/v1/lessons/{$secondLessons[0]->id}")->assertOk();

        Http::assertNothingSent();
    }

    /** @return array<string, string> slug → status z `GET /courses` */
    private function statuses(): array
    {
        $response = $this->getJson('/api/v1/courses')->assertOk();

        return collect($response->json('data'))->pluck('status', 'slug')->all();
    }

    /** @return array{Course, list<Lesson>} kurs ścieżki bez testu, lekcje bez nagrania */
    private function courseWithoutTest(int $order, int $lessonCount): array
    {
        $edition = Edition::query()->firstWhere('status', 'active') ?? Edition::create([
            'name' => 'Edycja kursu bez testu',
            'starts_at' => '2026-10-01',
            'ends_at' => '2027-09-30',
            'seats_limit' => 40,
            'test_pass_threshold' => 80,
            'test_attempts_limit' => 3,
            'internship_hours_required' => 72,
            'supervision_required_count' => 6,
            'reliability_threshold' => 60,
            'lesson_completion_percent' => 60,
            'status' => 'active',
        ]);

        $course = Course::create([
            'title' => 'Kurs bez testu '.$order,
            'slug' => 'kurs-bez-testu-'.$order,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => $order,
            'edition_id' => $edition->id,
            'is_published' => true,
        ]);

        $lessons = [];

        for ($i = 1; $i <= $lessonCount; $i++) {
            $lessons[] = Lesson::create([
                'course_id' => $course->id,
                'title' => 'Lekcja '.$i,
                'sequence_order' => $i,
                'duration_seconds' => 600,
            ]);
        }

        $this->assertNull($course->test()->first());

        return [$course, $lessons];
    }
}
