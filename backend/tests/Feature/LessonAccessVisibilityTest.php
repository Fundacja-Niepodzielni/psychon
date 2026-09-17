<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Edition;
use App\Models\InstructorQuestion;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

/**
 * Dostęp do treści lekcji (odczyt, pytania, postęp, ukończenie, link do
 * nagrania) sprawdza najpierw widoczność kursu, tak jak katalog kursów, a
 * dopiero potem kolejność w ścieżce. Kurs poza zasięgiem osoby odpowiada tak,
 * jakby nie istniał.
 */
class LessonAccessVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private ?Edition $edition = null;

    public function test_unpublished_first_course_hides_every_lesson_route_and_stores_nothing(): void
    {
        $course = $this->course(['sequence_order' => 1, 'is_published' => false]);
        $lesson = $this->lesson($course);
        $volunteer = $this->volunteer();
        $this->actingAs($volunteer, 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $questionsBefore = InstructorQuestion::count();
        $this->postJson("/api/v1/lessons/{$lesson->id}/questions", ['question' => 'Czy to widać?'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
        $this->assertSame($questionsBefore, InstructorQuestion::count());

        $this->getJson("/api/v1/lessons/{$lesson->id}/questions")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $progressBefore = LessonProgress::count();
        $this->postJson("/api/v1/lessons/{$lesson->id}/progress", [
            'watched_delta' => 10,
            'active_delta' => 10,
        ])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
        $this->assertSame($progressBefore, LessonProgress::count());

        $this->postJson("/api/v1/lessons/{$lesson->id}/complete")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_unpublished_course_answers_not_found_even_when_the_sequence_would_also_lock_it(): void
    {
        $first = $this->course(['sequence_order' => 1, 'is_published' => true]);
        $this->lesson($first);
        $second = $this->course(['sequence_order' => 2, 'is_published' => false]);
        $lesson = $this->lesson($second);

        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_course_from_a_different_product_group_hides_every_route_for_a_participant(): void
    {
        $wellbeingCourse = $this->course([
            'sequence_order' => null,
            'product_group' => 'dobrostan',
            'is_published' => true,
        ]);
        $lesson = $this->lesson($wellbeingCourse);
        $student = User::factory()->create(['role' => 'student', 'product_group' => 'psychon']);
        $this->actingAs($student, 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $questionsBefore = InstructorQuestion::count();
        $this->postJson("/api/v1/lessons/{$lesson->id}/questions", ['question' => 'Poza grupą.'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
        $this->assertSame($questionsBefore, InstructorQuestion::count());

        $this->getJson("/api/v1/lessons/{$lesson->id}/questions")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $progressBefore = LessonProgress::count();
        $this->postJson("/api/v1/lessons/{$lesson->id}/progress", [
            'watched_delta' => 10,
            'active_delta' => 10,
        ])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
        $this->assertSame($progressBefore, LessonProgress::count());

        $this->postJson("/api/v1/lessons/{$lesson->id}/complete")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    /**
     * Zastępuje `test_course_visible_only_to_students_hides_the_lesson_from_a_volunteer`
     * (kodowała regułę sprzed zawężenia: kolejność w ścieżce miała sterować
     * widocznością, więc kurs bez `sequence_order` był dla wolontariuszki
     * niewidoczny). Pod obowiązującą regułą widoczność zależy wyłącznie od
     * publikacji i przynależności do grupy produktowej (albo jawnego
     * przypisania) — kolejność steruje tylko odblokowaniem. Wolontariuszka z
     * tej samej grupy co opublikowany kurs poza ścieżką (zaproszenie,
     * webinar) ma do niego dostęp na takiej samej zasadzie co student w
     * `test_student_reaches_a_course_outside_the_sequence_in_their_own_group`.
     */
    public function test_volunteer_in_the_same_product_group_reaches_a_course_outside_the_sequence(): void
    {
        $outsideCourse = $this->course([
            'sequence_order' => null,
            'product_group' => 'psychon',
            'is_published' => true,
        ]);
        $lesson = $this->lesson($outsideCourse);
        $volunteer = User::factory()->create(['role' => 'volunteer', 'product_group' => 'psychon']);
        $this->actingAs($volunteer, 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $lesson->id);

        $questionsBefore = InstructorQuestion::count();
        $this->postJson("/api/v1/lessons/{$lesson->id}/questions", ['question' => 'Poza ścieżką, ale w grupie.'])
            ->assertCreated();
        $this->assertSame($questionsBefore + 1, InstructorQuestion::count());
    }

    /**
     * Nogo negatywna sparowana z testem powyżej: ta sama sytuacja (kurs
     * opublikowany, poza ścieżką), ale wolontariuszka z INNEJ grupy
     * produktowej — grupa, nie rola ani kolejność, jest tym, co odmawia.
     * „Nie ta grupa" ma odpowiadać tak samo jak „nic": 404, nie 200.
     */
    public function test_volunteer_from_a_different_product_group_is_hidden_from_a_course_outside_the_sequence(): void
    {
        $outsideCourse = $this->course([
            'sequence_order' => null,
            'product_group' => 'dobrostan',
            'is_published' => true,
        ]);
        $lesson = $this->lesson($outsideCourse);
        $volunteer = User::factory()->create(['role' => 'volunteer', 'product_group' => 'psychon']);
        $this->actingAs($volunteer, 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $questionsBefore = InstructorQuestion::count();
        $this->postJson("/api/v1/lessons/{$lesson->id}/questions", ['question' => 'Nie powinno przejść.'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
        $this->assertSame($questionsBefore, InstructorQuestion::count());
    }

    public function test_volunteer_reaches_a_published_first_course_without_a_predecessor(): void
    {
        $course = $this->course(['sequence_order' => 1, 'is_published' => true]);
        $lesson = $this->lesson($course);
        $volunteer = $this->volunteer();
        $this->actingAs($volunteer, 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $lesson->id);

        $questionsBefore = InstructorQuestion::count();
        $this->postJson("/api/v1/lessons/{$lesson->id}/questions", ['question' => 'Pierwszy etap.'])
            ->assertCreated();
        $this->assertSame($questionsBefore + 1, InstructorQuestion::count());

        $this->getJson("/api/v1/lessons/{$lesson->id}/questions")->assertOk();

        $this->postJson("/api/v1/lessons/{$lesson->id}/progress", [
            'watched_delta' => 10,
            'active_delta' => 10,
        ])->assertOk();
    }

    public function test_student_reaches_a_course_outside_the_sequence_in_their_own_group(): void
    {
        $outsideCourse = $this->course([
            'sequence_order' => null,
            'product_group' => 'psychon',
            'is_published' => true,
        ]);
        $lesson = $this->lesson($outsideCourse);
        $student = User::factory()->create(['role' => 'student', 'product_group' => 'psychon']);
        $this->actingAs($student, 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk();

        $questionsBefore = InstructorQuestion::count();
        $this->postJson("/api/v1/lessons/{$lesson->id}/questions", ['question' => 'Pytanie studenta.'])
            ->assertCreated();
        $this->assertSame($questionsBefore + 1, InstructorQuestion::count());
    }

    public function test_visible_course_with_an_unfinished_predecessor_is_locked_not_hidden(): void
    {
        $first = $this->course(['sequence_order' => 1, 'is_published' => true]);
        $this->lesson($first);
        $second = $this->course(['sequence_order' => 2, 'is_published' => true]);
        $lesson = $this->lesson($second);
        $volunteer = $this->volunteer();
        $this->actingAs($volunteer, 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked')
            ->assertJsonPath('error.reason.required_course_id', $first->id);

        $questionsBefore = InstructorQuestion::count();
        $this->postJson("/api/v1/lessons/{$lesson->id}/questions", ['question' => 'Za wcześnie.'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked')
            ->assertJsonPath('error.reason.required_course_id', $first->id);
        $this->assertSame($questionsBefore, InstructorQuestion::count());

        $this->getJson("/api/v1/lessons/{$lesson->id}/questions")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked')
            ->assertJsonPath('error.reason.required_course_id', $first->id);

        $this->postJson("/api/v1/lessons/{$lesson->id}/progress", [
            'watched_delta' => 10,
            'active_delta' => 10,
        ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked')
            ->assertJsonPath('error.reason.required_course_id', $first->id);

        $this->postJson("/api/v1/lessons/{$lesson->id}/complete")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked')
            ->assertJsonPath('error.reason.required_course_id', $first->id);
    }

    public function test_recording_link_hides_an_invisible_course(): void
    {
        $this->configureBunny();
        $course = $this->course(['sequence_order' => 1, 'is_published' => false]);
        $lesson = $this->lesson($course, ['video_provider_id' => 'mock-nagranie-1']);

        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_recording_link_locks_a_visible_course_with_an_unfinished_predecessor(): void
    {
        $this->configureBunny();
        $first = $this->course(['sequence_order' => 1, 'is_published' => true]);
        $this->lesson($first);
        $second = $this->course(['sequence_order' => 2, 'is_published' => true]);
        $lesson = $this->lesson($second, ['video_provider_id' => 'mock-nagranie-2']);

        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked')
            ->assertJsonPath('error.reason.required_course_id', $first->id);
    }

    public function test_recording_link_reports_a_missing_recording_on_a_visible_unlocked_lesson(): void
    {
        $this->configureBunny();
        $course = $this->course(['sequence_order' => 1, 'is_published' => true]);
        $lesson = $this->lesson($course, ['video_provider_id' => null]);

        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'video_missing');
    }

    public function test_missing_lesson_is_not_found_for_reading_and_asking(): void
    {
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson('/api/v1/lessons/999999')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->postJson('/api/v1/lessons/999999/questions', ['question' => 'Nikogo tu nie ma.'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    private function edition(): Edition
    {
        return $this->edition ??= Edition::query()->firstWhere('status', 'active') ?? Edition::create([
            'name' => 'Edycja widoczności',
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
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function course(array $overrides = []): Course
    {
        return Course::create([
            'title' => 'Kurs widoczności '.uniqid(),
            'slug' => 'kurs-widocznosci-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'edition_id' => $this->edition()->id,
            'is_published' => true,
            ...$overrides,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function lesson(Course $course, array $overrides = []): Lesson
    {
        return Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja widoczności',
            'sequence_order' => 1,
            'duration_seconds' => 600,
            ...$overrides,
        ]);
    }

    private function volunteer(): User
    {
        return User::factory()->create(['role' => 'volunteer', 'product_group' => 'psychon']);
    }

    private function configureBunny(): void
    {
        Config::set('services.bunny.api_key', 'test-api-key');
        Config::set('services.bunny.library_id', 'test-library');
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', 'test-security-key');
    }
}
