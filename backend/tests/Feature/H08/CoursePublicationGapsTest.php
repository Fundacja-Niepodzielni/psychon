<?php

namespace Tests\Feature\H08;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Braki kursu przed publikacją: zasób kursu (administracja i prowadzący)
 * pokazuje je w dwóch grupach, a publikacja odmawia DOKŁADNIE grupą blokującą
 * z tej samej reguły. Wszystko przez pełny stos tras; żadne żądanie nie
 * wychodzi do dostawcy nagrań.
 */
class CoursePublicationGapsTest extends TestCase
{
    use RefreshDatabase;

    private const string OLD = 'mock-stare-nagranie';

    private const string NEW = 'mock-nowe-nagranie';

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('services.bunny.api_key', 'test-api-key');
        Config::set('services.bunny.library_id', 'test-library');
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', 'test-security-key');
        Http::fake(['*' => Http::response(['status' => 4, 'length' => 125])]);
    }

    /**
     * Jedna lekcja w kursie → [nagranie odtwarzane, nagranie „w drodze”, stan,
     * treść, kod blokujący, kod „czekamy”].
     *
     * @return array<string, array{string|null, string|null, string|null, string|null, string|null, string|null}>
     */
    public static function singleLessonCourses(): array
    {
        return [
            'empty lesson' => [null, null, null, null, 'lesson_empty', null],
            'content of white space only' => [null, null, null, " \n\t ", 'lesson_empty', null],
            'content only' => [null, null, null, 'Treść lekcji.', null, null],
            'existing recording, state unknown' => [self::OLD, null, null, null, null, null],
            'ready recording' => [self::OLD, null, 'ready', null, null, null],
            'recording in error' => [self::OLD, null, 'error', null, 'recording_error', null],
            'recording in error, lesson has content' => [self::OLD, null, 'error', 'Treść lekcji.', 'recording_error', null],
            'first recording in error' => [null, self::NEW, 'error', null, 'recording_error', null],
            'first recording being uploaded' => [null, self::NEW, 'uploading', null, null, 'recording_in_progress'],
            'first recording being processed' => [null, self::NEW, 'processing', null, null, 'recording_in_progress'],
            'first recording being uploaded, lesson has content' => [null, self::NEW, 'uploading', 'Treść lekcji.', null, 'recording_in_progress'],
            'replacement being uploaded' => [self::OLD, self::NEW, 'uploading', null, null, null],
            'replacement in error' => [self::OLD, self::NEW, 'error', null, null, null],
        ];
    }

    #[DataProvider('singleLessonCourses')]
    public function test_resource_and_publication_speak_with_one_rule(
        ?string $played,
        ?string $pending,
        ?string $status,
        ?string $content,
        ?string $blockingCode,
        ?string $waitingCode,
    ): void {
        $course = $this->draft();
        $lesson = $this->lesson($course, 1, $played, $pending, $status, $content);

        $expected = [
            'blocking' => $blockingCode === null ? [] : [['code' => $blockingCode, 'lesson_id' => $lesson->id]],
            'waiting' => $waitingCode === null ? [] : [['code' => $waitingCode, 'lesson_id' => $lesson->id]],
        ];

        $this->actingAs($this->assignedInstructor($course), 'keycloak');
        $forInstructor = $this->getJson("/api/v1/instructor/courses/{$course->id}")->assertOk()->json('data.publication_gaps');

        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');
        $forAdmin = $this->getJson("/api/v1/admin/courses/{$course->id}")->assertOk()->json('data.publication_gaps');

        $this->assertSame($expected, $forAdmin);
        $this->assertSame($forAdmin, $forInstructor, 'Prowadzący i administracja widzą te same braki.');

        $publish = $this->patchJson("/api/v1/admin/courses/{$course->id}", ['is_published' => true]);

        if ($blockingCode === null) {
            $publish->assertOk()
                ->assertJsonPath('data.is_published', true)
                ->assertJsonPath('data.publication_gaps', $expected);
            $this->assertTrue($course->fresh()->is_published, 'Braki „czekamy” nie blokują publikacji.');
        } else {
            $publish->assertStatus(422)
                ->assertJsonPath('error.code', 'conditions_not_met')
                ->assertJsonPath('error.message', 'Uzupełnij lekcje wskazane na liście braków, zanim opublikujesz kurs.');
            $this->assertSame(
                $forAdmin['blocking'],
                $publish->json('error.reason.missing'),
                'Odmowa publikacji niesie dokładnie braki blokujące z zasobu kursu.',
            );
            $this->assertFalse($course->fresh()->is_published);
        }

        Http::assertNothingSent();
    }

    public function test_a_course_without_lessons_has_one_blocking_gap_without_a_lesson(): void
    {
        $course = $this->draft();
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $gaps = $this->getJson("/api/v1/admin/courses/{$course->id}")->assertOk()->json('data.publication_gaps');

        $this->assertSame(
            ['blocking' => [['code' => 'course_without_lessons', 'lesson_id' => null]], 'waiting' => []],
            $gaps,
        );

        $this->patchJson("/api/v1/admin/courses/{$course->id}", ['is_published' => true])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met')
            ->assertJsonPath('error.message', 'Dodaj co najmniej jedną lekcję, zanim opublikujesz kurs.')
            ->assertJsonPath('error.reason.missing', $gaps['blocking']);
    }

    public function test_a_course_lists_every_gap_in_lesson_order_and_publication_names_only_the_blocking_ones(): void
    {
        $course = $this->draft();
        $ready = $this->lesson($course, 1, self::OLD, null, 'ready', null);
        $empty = $this->lesson($course, 2, null, null, null, null);
        $uploading = $this->lesson($course, 3, null, self::NEW, 'uploading', null);
        $broken = $this->lesson($course, 4, 'mock-zepsute', null, 'error', 'Treść lekcji.');
        $processing = $this->lesson($course, 5, null, 'mock-przetwarzane', 'processing', null);
        $deleted = $this->lesson($course, 6, null, null, null, null);
        $deleted->delete();

        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $expected = [
            'blocking' => [
                ['code' => 'lesson_empty', 'lesson_id' => $empty->id],
                ['code' => 'recording_error', 'lesson_id' => $broken->id],
            ],
            'waiting' => [
                ['code' => 'recording_in_progress', 'lesson_id' => $uploading->id],
                ['code' => 'recording_in_progress', 'lesson_id' => $processing->id],
            ],
        ];

        $this->getJson("/api/v1/admin/courses/{$course->id}")
            ->assertOk()
            ->assertJsonPath('data.publication_gaps', $expected);

        $list = $this->getJson('/api/v1/admin/courses')->assertOk()->json('data');
        $this->assertSame($expected, collect($list)->firstWhere('id', $course->id)['publication_gaps']);

        $this->patchJson("/api/v1/admin/courses/{$course->id}", ['is_published' => true])
            ->assertStatus(422)
            ->assertJsonPath('error.reason.missing', $expected['blocking']);

        $this->assertNotContains($ready->id, array_column([...$expected['blocking'], ...$expected['waiting']], 'lesson_id'));
        Http::assertNothingSent();
    }

    public function test_a_published_course_is_not_withdrawn_and_stays_editable_when_a_gap_appears(): void
    {
        $course = $this->draft();
        $lesson = $this->lesson($course, 1, self::OLD, null, 'ready', null);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson("/api/v1/admin/courses/{$course->id}", ['is_published' => true])->assertOk();

        // Nagranie opublikowanego kursu okazuje się zepsute.
        DB::table('lessons')->where('id', $lesson->id)->update(['video_status' => 'error']);

        $this->getJson("/api/v1/admin/courses/{$course->id}")
            ->assertOk()
            ->assertJsonPath('data.is_published', true)
            ->assertJsonPath('data.publication_gaps.blocking', [['code' => 'recording_error', 'lesson_id' => $lesson->id]]);

        $this->patchJson("/api/v1/admin/courses/{$course->id}", ['title' => 'Nowy tytuł', 'is_published' => true])
            ->assertOk()
            ->assertJsonPath('data.title', 'Nowy tytuł')
            ->assertJsonPath('data.is_published', true);

        $this->assertTrue($course->fresh()->is_published, 'Reguła dotyczy przejścia do „opublikowany”, nie cofa publikacji.');

        // Ponowna publikacja po wycofaniu przechodzi już przez regułę.
        $this->patchJson("/api/v1/admin/courses/{$course->id}", ['is_published' => false])->assertOk();
        $this->patchJson("/api/v1/admin/courses/{$course->id}", ['is_published' => true])
            ->assertStatus(422)
            ->assertJsonPath('error.reason.missing', [['code' => 'recording_error', 'lesson_id' => $lesson->id]]);
    }

    private function draft(): Course
    {
        return Course::create([
            'title' => 'Kurs przed publikacją',
            'slug' => 'kurs-przed-publikacja-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'is_published' => false,
        ]);
    }

    private function lesson(
        Course $course,
        int $sequenceOrder,
        ?string $played,
        ?string $pending,
        ?string $status,
        ?string $content,
    ): Lesson {
        $lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja '.$sequenceOrder,
            'sequence_order' => $sequenceOrder,
            'content' => $content,
            'duration_seconds' => 600,
        ]);

        DB::table('lessons')->where('id', $lesson->id)->update([
            'video_provider_id' => $played,
            'video_pending_id' => $pending,
            'video_status' => $status,
            'video_status_at' => $status === null ? null : now()->subHour(),
        ]);

        return $lesson->fresh();
    }

    private function assignedInstructor(Course $course): User
    {
        $instructor = User::factory()->role('instructor')->create();

        CourseAssignment::create([
            'course_id' => $course->id,
            'lesson_id' => null,
            'instructor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);

        return $instructor;
    }
}
