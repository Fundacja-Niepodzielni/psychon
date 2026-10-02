<?php

namespace Tests\Feature\H06;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Edition;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Podgląd kursu nieopublikowanego: personel i przypisany prowadzący czytają go
 * tymi samymi trasami co uczestnik (kurs, lekcja, link nagrania); wszyscy
 * pozostali dostają 404 identyczne jak dla kursu nieistniejącego. Lista kursów
 * nie pokazuje szkicu nikomu.
 */
class DraftCoursePreviewTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Http::fake();
        Config::set('services.bunny.api_key', 'test-api-key');
        Config::set('services.bunny.library_id', 'test-library');
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', 'test-security-key');
    }

    /** @return array<string, array{string}> */
    public static function previewingRoles(): array
    {
        return ['project manager' => ['project_manager'], 'super admin' => ['super_admin'], 'assigned instructor' => ['instructor']];
    }

    #[DataProvider('previewingRoles')]
    public function test_staff_and_an_assigned_instructor_read_a_draft_on_all_three_routes(string $role): void
    {
        [$course, $lesson] = $this->draftCourse();
        $person = User::factory()->create(['role' => $role, 'product_group' => 'psychon']);

        if ($role === 'instructor') {
            $this->assign($course, $person);
        }

        $this->actingAs($person, 'keycloak');

        $this->getJson("/api/v1/courses/{$course->slug}")->assertOk()->assertJsonPath('data.slug', $course->slug);
        $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk()->assertJsonPath('data.id', $lesson->id);
        $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")->assertOk();
    }

    public function test_an_unassigned_instructor_gets_404_on_all_three_routes(): void
    {
        [$course, $lesson] = $this->draftCourse();
        // Bez przypisania i bez związku przez grupę produktową kursu.
        $this->actingAs(User::factory()->create(['role' => 'instructor', 'product_group' => 'dobrostan']), 'keycloak');

        $this->assertDraftIsNotFoundOnAllThreeRoutes($course, $lesson);
    }

    /** @return array<string, array{string}> */
    public static function participantRoles(): array
    {
        return ['volunteer' => ['volunteer'], 'student' => ['student']];
    }

    #[DataProvider('participantRoles')]
    public function test_a_participant_gets_404_on_all_three_routes_also_with_a_trace_on_the_course(string $role): void
    {
        [$course, $lesson] = $this->draftCourse($role === 'student' ? null : 1);
        $participant = User::factory()->create(['role' => $role, 'product_group' => 'psychon']);
        LessonProgress::create([
            'user_id' => $participant->id,
            'lesson_id' => $lesson->id,
            'watched_seconds' => 10,
            'active_seconds' => 10,
            'open_count' => 1,
            'is_completed' => false,
        ]);
        $this->actingAs($participant, 'keycloak');

        $this->assertDraftIsNotFoundOnAllThreeRoutes($course, $lesson);
    }

    public function test_the_refusal_for_a_draft_is_byte_for_byte_the_one_for_a_missing_course(): void
    {
        [$course, $lesson] = $this->draftCourse();
        $this->actingAs(User::factory()->create(['role' => 'volunteer', 'product_group' => 'psychon']), 'keycloak');

        $missingLesson = $lesson->id + 1000;

        $this->assertSame(
            $this->getJson('/api/v1/courses/nie-ma-takiego-kursu')->getContent(),
            $this->getJson("/api/v1/courses/{$course->slug}")->getContent(),
        );
        $this->assertSame(
            $this->getJson("/api/v1/lessons/{$missingLesson}")->getContent(),
            $this->getJson("/api/v1/lessons/{$lesson->id}")->getContent(),
        );
        $this->assertSame(
            $this->getJson("/api/v1/lessons/{$missingLesson}/video-link")->getContent(),
            $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")->getContent(),
        );
    }

    /** @return array<string, array{string}> */
    public static function everyRole(): array
    {
        return ['volunteer' => ['volunteer'], 'student' => ['student'], 'instructor' => ['instructor'], 'project manager' => ['project_manager'], 'super admin' => ['super_admin']];
    }

    #[DataProvider('everyRole')]
    public function test_the_course_list_never_contains_a_draft(string $role): void
    {
        [$course] = $this->draftCourse($role === 'student' ? null : 1);
        $person = User::factory()->create(['role' => $role, 'product_group' => 'psychon']);
        $this->assign($course, $person);
        $this->actingAs($person, 'keycloak');

        $slugs = array_column($this->getJson('/api/v1/courses')->assertOk()->json('data'), 'slug');

        $this->assertNotContains($course->slug, $slugs);
    }

    public function test_a_published_course_is_read_as_before_by_every_role(): void
    {
        [$course, $lesson] = $this->draftCourse();
        $course->forceFill(['is_published' => true])->save();

        foreach (['volunteer', 'project_manager', 'super_admin'] as $role) {
            $this->actingAs(User::factory()->create(['role' => $role, 'product_group' => 'psychon']), 'keycloak');

            $this->getJson("/api/v1/courses/{$course->slug}")->assertOk();
            $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk();
        }
    }

    public function test_the_recording_link_of_a_draft_sends_nothing_to_the_provider(): void
    {
        [$course, $lesson] = $this->draftCourse();
        Config::set('services.bunny.api_key', null);
        Config::set('services.bunny.library_id', null);
        Config::set('services.bunny.cdn_hostname', null);
        Config::set('services.bunny.token_security_key', null);
        $this->actingAs(User::factory()->create(['role' => 'project_manager', 'product_group' => 'psychon']), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}/video-link");

        Http::assertNothingSent();
    }

    // ------------------------------------------------------------------

    private function assertDraftIsNotFoundOnAllThreeRoutes(Course $course, Lesson $lesson): void
    {
        $this->getJson("/api/v1/courses/{$course->slug}")->assertStatus(404)->assertJsonPath('error.code', 'not_found');
        $this->getJson("/api/v1/lessons/{$lesson->id}")->assertStatus(404)->assertJsonPath('error.code', 'not_found');
        $this->getJson("/api/v1/lessons/{$lesson->id}/video-link")->assertStatus(404)->assertJsonPath('error.code', 'not_found');
    }

    private function assign(Course $course, User $person): void
    {
        CourseAssignment::create([
            'course_id' => $course->id,
            'lesson_id' => null,
            'instructor_id' => $person->id,
            'assigned_by' => $person->id,
            'assigned_at' => now(),
        ]);
    }

    /**
     * @return array{0: Course, 1: Lesson}
     */
    private function draftCourse(?int $order = 1): array
    {
        $edition = Edition::query()->firstWhere('status', 'active') ?? Edition::create([
            'name' => 'Edycja podglądu',
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
            'title' => 'Szkic kursu',
            'slug' => 'szkic-kursu',
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => $order,
            'edition_id' => $edition->id,
            'is_published' => false,
        ]);

        $lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja szkicu',
            'sequence_order' => 1,
            'duration_seconds' => 600,
        ]);

        DB::table('lessons')->where('id', $lesson->id)->update([
            'video_provider_id' => 'mock-nagranie-szkic',
            'video_status' => 'ready',
            'video_status_at' => now(),
        ]);

        return [$course, $lesson->fresh()];
    }
}
