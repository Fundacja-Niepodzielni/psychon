<?php

namespace Tests\Feature\H06;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Edition;
use App\Models\InstructorQuestion;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\Material;
use App\Models\Test;
use App\Models\TestAttempt;
use App\Models\User;
use App\Support\CourseAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Reguła „lekcje po kolei” (`LessonSequence`): lekcja jest otwarta dla
 * uczestnika, gdy jest pierwsza w kursie, gdy poprzednia jest ukończona albo
 * gdy sama jest ukończona. W przeciwnym razie 403 `lesson_locked`.
 *
 * Wszystko idzie przez pełny stos tras. Dostawcę nagrań zastępuje atrapa.
 */
class LessonSequenceTest extends TestCase
{
    use RefreshDatabase;

    private int $recordings = 0;

    protected function setUp(): void
    {
        parent::setUp();

        Http::fake();
        Config::set('services.bunny.api_key', 'test-api-key');
        Config::set('services.bunny.library_id', 'test-library');
        Config::set('services.bunny.cdn_hostname', 'cdn.example.test');
        Config::set('services.bunny.token_security_key', 'test-security-key');
    }

    // ------------------------------------------------------------------
    // każda trasa uczestnika: noga dodatnia i ujemna
    // ------------------------------------------------------------------

    /** @return array<string, array{string, string, array<string, mixed>, int}> */
    public static function participantRoutes(): array
    {
        return [
            'lesson read' => ['GET', '/api/v1/lessons/%d', [], 200],
            'progress' => ['POST', '/api/v1/lessons/%d/progress', ['watched_delta' => 5, 'active_delta' => 5], 200],
            'complete' => ['POST', '/api/v1/lessons/%d/complete', [], 422],
            'video link' => ['GET', '/api/v1/lessons/%d/video-link', [], 200],
            'questions list' => ['GET', '/api/v1/lessons/%d/questions', [], 200],
            'question store' => ['POST', '/api/v1/lessons/%d/questions', ['question' => 'Czy to jest jasne?'], 201],
        ];
    }

    /** @param  array<string, mixed>  $body */
    #[DataProvider('participantRoutes')]
    public function test_an_open_lesson_keeps_the_existing_answer_on_every_route(string $method, string $url, array $body, int $expected): void
    {
        [$course, $lessons] = $this->courseWithLessons(3);
        $this->actingAs($this->volunteer(), 'keycloak');

        // Pierwsza lekcja kursu jest otwarta (warunek 1).
        $response = $this->json($method, sprintf($url, $lessons[0]->id), $body);

        $this->assertSame($expected, $response->status());
        $this->assertNotSame('lesson_locked', $response->json('error.code'));
    }

    /** @param  array<string, mixed>  $body */
    #[DataProvider('participantRoutes')]
    public function test_a_closed_lesson_is_refused_on_every_route_and_writes_nothing(string $method, string $url, array $body): void
    {
        [$course, $lessons] = $this->courseWithLessons(3);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');

        $before = $this->writes($user);

        $response = $this->json($method, sprintf($url, $lessons[2]->id), $body)
            ->assertStatus(403)
            ->assertJsonPath('error.status', 403)
            ->assertJsonPath('error.code', 'lesson_locked')
            ->assertJsonPath('error.reason.required_lesson_id', $lessons[1]->id);

        $this->assertSame('Najpierw ukończ lekcję 2: Lekcja 2.', $response->json('error.message'));
        $this->assertNull($response->json('data'));
        $this->assertSame($before, $this->writes($user), 'Odmowa niczego nie zapisuje: postęp, open_count, ukończenie, pytania.');
    }

    public function test_a_guest_is_refused_with_401_before_any_lesson_rule(): void
    {
        [$course, $lessons] = $this->courseWithLessons(3);

        $this->getJson("/api/v1/lessons/{$lessons[2]->id}")->assertStatus(401)->assertJsonPath('error.code', 'unauthenticated');
    }

    // ------------------------------------------------------------------
    // trzy warunki otwarcia osobno
    // ------------------------------------------------------------------

    public function test_the_three_opening_conditions_are_independent(): void
    {
        [$course, $lessons] = $this->courseWithLessons(4);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $this->completeLesson($user, $lessons[2]); // trzecia ukończona, druga NIE

        // 1. pierwsza lekcja kursu — otwarta bez żadnego postępu
        $this->getJson("/api/v1/lessons/{$lessons[0]->id}")->assertOk();
        // druga: poprzednia (pierwsza) nieukończona, sama nieukończona — zamknięta
        $this->getJson("/api/v1/lessons/{$lessons[1]->id}")->assertStatus(403)->assertJsonPath('error.reason.required_lesson_id', $lessons[0]->id);
        // 3. trzecia sama ukończona przy nieukończonej poprzedniej — otwarta
        $this->getJson("/api/v1/lessons/{$lessons[2]->id}")->assertOk();
        // czwarta: poprzednia (trzecia) ukończona — otwarta (warunek 2)
        $this->getJson("/api/v1/lessons/{$lessons[3]->id}")->assertOk();

        // Ukończenie pierwszej otwiera drugą.
        $this->completeLesson($user, $lessons[0]);
        $this->getJson("/api/v1/lessons/{$lessons[1]->id}")->assertOk();
    }

    public function test_progress_without_completion_does_not_open_a_lesson(): void
    {
        [$course, $lessons] = $this->courseWithLessons(3);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        DB::table('lesson_progress')->insert([
            'user_id' => $user->id, 'lesson_id' => $lessons[2]->id, 'position_seconds' => 40,
            'watched_seconds' => 40, 'active_seconds' => 40, 'open_count' => 3, 'last_activity_at' => null,
            'is_completed' => false, 'completed_at' => null, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->getJson("/api/v1/lessons/{$lessons[2]->id}")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'lesson_locked');
        $this->assertSame(3, (int) LessonProgress::where('user_id', $user->id)->where('lesson_id', $lessons[2]->id)->value('open_count'));
    }

    // ------------------------------------------------------------------
    // zmiana kolejności po publikacji, kolejność przez tematy
    // ------------------------------------------------------------------

    public function test_a_completed_lesson_moved_behind_an_incomplete_one_stays_open(): void
    {
        [$course, $lessons] = $this->courseWithLessons(3);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $this->completeLesson($user, $lessons[0]);
        $this->completeLesson($user, $lessons[1]);

        // Pierwsza i druga ukończone, trzecia otwarta; przesuwam ukończoną
        // pierwszą na koniec: kolejność 2, 3, 1.
        $this->setOrder([$lessons[1], $lessons[2], $lessons[0]]);

        $this->getJson("/api/v1/lessons/{$lessons[0]->id}")->assertOk();
        $this->getJson("/api/v1/lessons/{$lessons[2]->id}")->assertOk(); // poprzednia (druga) ukończona
    }

    public function test_an_incomplete_lesson_moved_to_the_start_is_open_and_the_next_one_waits_for_it(): void
    {
        [$course, $lessons] = $this->courseWithLessons(3);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $this->completeLesson($user, $lessons[0]);

        // Trzecia (nieukończona) na początek: kolejność 3, 1, 2.
        $this->setOrder([$lessons[2], $lessons[0], $lessons[1]]);

        $this->getJson("/api/v1/lessons/{$lessons[2]->id}")->assertOk(); // pierwsza w kursie
        $this->getJson("/api/v1/lessons/{$lessons[0]->id}")->assertOk(); // sama ukończona
        $this->getJson("/api/v1/lessons/{$lessons[1]->id}")->assertOk(); // poprzednia (pierwsza) ukończona

        // Nieukończona przy nieukończonej poprzedniej jest zamknięta także po przestawieniu.
        $this->setOrder([$lessons[2], $lessons[1], $lessons[0]]);
        $this->getJson("/api/v1/lessons/{$lessons[1]->id}")
            ->assertStatus(403)
            ->assertJsonPath('error.reason.required_lesson_id', $lessons[2]->id);
    }

    public function test_the_order_runs_through_topics_the_last_of_one_topic_gates_the_first_of_the_next(): void
    {
        [$course, $lessons] = $this->courseWithLessons(4);
        $first = DB::table('course_topics')->insertGetId(['course_id' => $course->id, 'title' => 'Temat 1', 'position' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $second = DB::table('course_topics')->insertGetId(['course_id' => $course->id, 'title' => 'Temat 2', 'position' => 2, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('lessons')->whereIn('id', [$lessons[0]->id, $lessons[1]->id])->update(['topic_id' => $first]);
        DB::table('lessons')->whereIn('id', [$lessons[2]->id, $lessons[3]->id])->update(['topic_id' => $second]);
        DB::table('lessons')->where('id', $lessons[0]->id)->update(['topic_position' => 1]);
        DB::table('lessons')->where('id', $lessons[1]->id)->update(['topic_position' => 2]);
        DB::table('lessons')->where('id', $lessons[2]->id)->update(['topic_position' => 1]);
        DB::table('lessons')->where('id', $lessons[3]->id)->update(['topic_position' => 2]);

        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $this->completeLesson($user, $lessons[0]);

        // Pierwsza lekcja drugiego tematu czeka na ostatnią lekcję pierwszego.
        $this->getJson("/api/v1/lessons/{$lessons[2]->id}")
            ->assertStatus(403)
            ->assertJsonPath('error.reason.required_lesson_id', $lessons[1]->id)
            ->assertJsonPath('error.message', 'Najpierw ukończ lekcję 2: Lekcja 2.');

        $this->completeLesson($user, $lessons[1]);
        $this->getJson("/api/v1/lessons/{$lessons[2]->id}")->assertOk();
    }

    // ------------------------------------------------------------------
    // kolejność odmów: 401, 404, course_locked, lesson_locked
    // ------------------------------------------------------------------

    public function test_a_course_locked_by_the_path_answers_course_locked_not_lesson_locked(): void
    {
        $this->courseWithLessons(2); // etap 1, nieukończony
        [$second, $secondLessons] = $this->courseWithLessons(3, order: 2);
        $this->actingAs($this->volunteer(), 'keycloak');

        // Trzecia lekcja drugiego etapu byłaby też zamknięta regułą lekcji.
        $this->getJson("/api/v1/lessons/{$secondLessons[2]->id}")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked');
    }

    public function test_an_invisible_lesson_answers_not_found_before_the_lesson_rule(): void
    {
        [$course, $lessons] = $this->courseWithLessons(3);
        Course::whereKey($course->id)->update(['is_published' => false]);
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lessons[2]->id}")->assertStatus(404)->assertJsonPath('error.code', 'not_found');
        $this->getJson('/api/v1/lessons/99999999')->assertStatus(404)->assertJsonPath('error.code', 'not_found');
    }

    // ------------------------------------------------------------------
    // personel i prowadzący bez zmian
    // ------------------------------------------------------------------

    /** @return array<string, array{string}> */
    public static function staffRoles(): array
    {
        return ['project manager' => ['project_manager'], 'super admin' => ['super_admin'], 'assigned instructor' => ['instructor']];
    }

    #[DataProvider('staffRoles')]
    public function test_staff_and_an_assigned_instructor_are_not_bound_by_the_lesson_order(string $role): void
    {
        [$course, $lessons] = $this->courseWithLessons(3, withTest: true);
        $staff = User::factory()->create(['role' => $role, 'product_group' => 'psychon']);
        CourseAssignment::create(['course_id' => $course->id, 'lesson_id' => null, 'instructor_id' => $staff->id, 'assigned_by' => $staff->id, 'assigned_at' => now()]);
        $this->actingAs($staff, 'keycloak');

        $this->getJson("/api/v1/lessons/{$lessons[2]->id}")->assertOk();

        $course = $this->getJson("/api/v1/courses/{$course->slug}")->assertOk();
        $this->assertSame([false, false, false], array_column($course->json('data.lessons'), 'locked'));
        $this->assertFalse($course->json('data.test_locked'));
    }

    // ------------------------------------------------------------------
    // odczyt kursu: `locked` zgodne z odmowami tras, `test_locked`
    // ------------------------------------------------------------------

    public function test_locked_in_the_course_read_equals_the_refusal_of_the_lesson_route_for_every_lesson(): void
    {
        [$course, $lessons] = $this->courseWithLessons(6, withTest: true);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $this->completeLesson($user, $lessons[0]);
        $this->completeLesson($user, $lessons[1]);
        $this->completeLesson($user, $lessons[4]); // ukończona przy nieukończonej poprzedniej

        $read = $this->getJson("/api/v1/courses/{$course->slug}")->assertOk()->json('data.lessons');

        $this->assertCount(6, $read);
        $locked = [];

        foreach ($read as $entry) {
            $response = $this->getJson("/api/v1/lessons/{$entry['id']}");
            $isRefused = $response->status() === 403 && $response->json('error.code') === 'lesson_locked';
            $this->assertSame($isRefused, $entry['locked'], "Lekcja {$entry['id']}: pole `locked` i odmowa trasy różnią się.");
            $this->assertContains($response->status(), [200, 403]);
            $locked[] = $entry['locked'];
        }

        // 1, 2 ukończone → otwarte; 3 (poprzednia ukończona) otwarta; 4 zamknięta; 5 ukończona → otwarta; 6 (poprzednia ukończona) otwarta.
        $this->assertSame([false, false, false, true, false, false], $locked);
    }

    public function test_test_locked_in_four_legs(): void
    {
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');

        // bez testu, lekcje nieukończone
        [$noTest] = $this->courseWithLessons(2, slug: 'bez-testu');
        $this->assertFalse($this->getJson('/api/v1/courses/bez-testu')->assertOk()->json('data.test_locked'));

        // z testem, bez lekcji
        [$noLessons] = $this->courseWithLessons(0, withTest: true, slug: 'bez-lekcji');
        $this->assertFalse($this->getJson('/api/v1/courses/bez-lekcji')->assertOk()->json('data.test_locked'));

        // z testem, lekcje nieukończone
        [, $lessons] = $this->courseWithLessons(2, withTest: true, slug: 'z-testem');
        $this->assertTrue($this->getJson('/api/v1/courses/z-testem')->assertOk()->json('data.test_locked'));

        // z testem, wszystkie ukończone
        foreach ($lessons as $lesson) {
            $this->completeLesson($user, $lesson);
        }
        $this->assertFalse($this->getJson('/api/v1/courses/z-testem')->assertOk()->json('data.test_locked'));
    }

    public function test_the_course_read_query_count_does_not_grow_with_the_number_of_lessons(): void
    {
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $counts = [];

        foreach ([3, 30] as $n) {
            [$course] = $this->courseWithLessons($n, withTest: true, slug: 'kurs-zapytan-'.$n);
            $this->getJson("/api/v1/courses/{$course->slug}")->assertOk();
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson("/api/v1/courses/{$course->slug}")->assertOk();
            $counts[$n] = count(DB::getQueryLog());
            DB::disableQueryLog();
        }

        $this->assertSame($counts[3], $counts[30], 'Odczyt kursu: liczba zapytań nie zależy od liczby lekcji.');
    }

    // ------------------------------------------------------------------
    // start testu przed ukończeniem wszystkich lekcji
    // ------------------------------------------------------------------

    public function test_the_test_is_refused_until_every_lesson_is_completed_and_nothing_is_written(): void
    {
        [$course, $lessons, $test] = $this->courseWithLessons(3, withTest: true);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $this->completeLesson($user, $lessons[0]);
        $this->completeLesson($user, $lessons[1]);
        $answers = $this->answers($test);

        $this->getJson("/api/v1/courses/{$course->slug}/test")
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met')
            ->assertJsonPath('error.reason.missing', ['lessons']);
        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $answers])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met')
            ->assertJsonPath('error.reason.missing', ['lessons']);
        $this->assertSame(0, TestAttempt::where('user_id', $user->id)->count(), 'Odmowa nie zużywa podejścia.');

        $this->completeLesson($user, $lessons[2]);

        $this->getJson("/api/v1/courses/{$course->slug}/test")->assertOk()->assertJsonPath('data.attempts_used', 0);
        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $answers])->assertCreated()->assertJsonPath('data.attempt_number', 1);
        $this->assertSame(1, TestAttempt::where('user_id', $user->id)->count());
    }

    public function test_a_course_without_lessons_does_not_lock_its_test(): void
    {
        [$course, , $test] = $this->courseWithLessons(0, withTest: true);
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/courses/{$course->slug}/test")->assertOk();
        $this->postJson("/api/v1/tests/{$test->id}/attempts", ['answers' => $this->answers($test)])->assertCreated();
    }

    public function test_the_test_refusal_keeps_the_order_course_locked_before_lessons_missing(): void
    {
        $this->courseWithLessons(2); // etap 1 nieukończony
        [$second, , $test] = $this->courseWithLessons(2, order: 2, withTest: true);
        $this->actingAs($this->volunteer(), 'keycloak');

        $this->getJson("/api/v1/courses/{$second->slug}/test")->assertStatus(403)->assertJsonPath('error.code', 'course_locked');
    }

    // ------------------------------------------------------------------
    // odczyt kursu: czas aktywny, nagranie, zaliczenie testu
    // ------------------------------------------------------------------

    public function test_the_course_read_time_fields_equal_the_lesson_read_for_every_lesson(): void
    {
        [$course, $lessons] = $this->courseWithLessons(4, withTest: true);
        // Druga lekcja bez nagrania.
        DB::table('lessons')->where('id', $lessons[1]->id)->update(['video_provider_id' => null, 'video_status' => null, 'video_status_at' => null]);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $this->completeLesson($user, $lessons[0]);

        $read = $this->getJson("/api/v1/courses/{$course->slug}")->assertOk()->json('data.lessons');

        $this->assertSame([true, false, true, true], array_column($read, 'has_recording'));
        $this->assertSame([false, false, true, true], array_column($read, 'locked'));

        foreach ($read as $entry) {
            $this->assertIsInt($entry['active_seconds']);
            $this->assertIsInt($entry['required_active_seconds']);

            if ($entry['locked']) {
                // Lekcja zamknięta: pola obecne, bez postępu — zero czasu aktywnego.
                $this->assertSame(0, $entry['active_seconds']);
                $this->assertSame($entry['has_recording'] ? 360 : 0, $entry['required_active_seconds']);

                continue;
            }

            $lesson = $this->getJson("/api/v1/lessons/{$entry['id']}")->assertOk();
            $this->assertSame($lesson->json('data.active_seconds'), $entry['active_seconds'], "Lekcja {$entry['id']}: czas aktywny.");
            $this->assertSame($lesson->json('data.required_active_seconds'), $entry['required_active_seconds'], "Lekcja {$entry['id']}: wymagany czas.");
            $this->assertSame($lesson->json('data.video_status') !== 'none', $entry['has_recording'], "Lekcja {$entry['id']}: nagranie.");
        }

        $this->assertSame(600, $read[0]['active_seconds']);
        $this->assertSame(360, $read[0]['required_active_seconds']);
        $this->assertSame(0, $read[1]['required_active_seconds']);
    }

    public function test_the_course_read_time_fields_for_staff_without_progress_are_zero(): void
    {
        [$course] = $this->courseWithLessons(2);
        $this->actingAs(User::factory()->create(['role' => 'project_manager', 'product_group' => 'psychon']), 'keycloak');

        $read = $this->getJson("/api/v1/courses/{$course->slug}")->assertOk()->json('data.lessons');

        $this->assertSame([0, 0], array_column($read, 'active_seconds'));
        $this->assertSame([360, 360], array_column($read, 'required_active_seconds'));
        $this->assertSame([true, true], array_column($read, 'has_recording'));
    }

    public function test_the_course_read_without_any_measurable_lesson_does_not_need_an_active_edition(): void
    {
        $course = Course::create([
            'title' => 'Kurs bez nagrań',
            'slug' => 'kurs-bez-nagran',
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => 1,
            'is_published' => true,
        ]);
        Lesson::create(['course_id' => $course->id, 'title' => 'Sama treść', 'sequence_order' => 1, 'duration_seconds' => 0]);
        $this->actingAs(User::factory()->create(['role' => 'project_manager', 'product_group' => 'psychon']), 'keycloak');

        $read = $this->getJson('/api/v1/courses/kurs-bez-nagran')->assertOk()->json('data.lessons');

        $this->assertSame([0], array_column($read, 'required_active_seconds'));
        $this->assertSame([false], array_column($read, 'has_recording'));
    }

    public function test_test_passed_in_three_legs_matches_the_course_access_rule(): void
    {
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');

        $this->courseWithLessons(1, slug: 'bez-testu-zaliczenie');
        $this->assertFalse($this->getJson('/api/v1/courses/bez-testu-zaliczenie')->assertOk()->json('data.test_passed'));

        [$course, , $test] = $this->courseWithLessons(1, withTest: true, slug: 'z-testem-zaliczenie');
        $this->assertFalse($this->getJson('/api/v1/courses/z-testem-zaliczenie')->assertOk()->json('data.test_passed'));
        $this->assertFalse(CourseAccess::testPassed($user, $course->fresh('test')));

        TestAttempt::create([
            'user_id' => $user->id, 'test_id' => $test->id, 'attempt_number' => 1,
            'answers' => [], 'questions_snapshot' => [], 'score_percent' => 20, 'passed' => false,
        ]);
        $this->assertFalse($this->getJson('/api/v1/courses/z-testem-zaliczenie')->assertOk()->json('data.test_passed'));

        TestAttempt::create([
            'user_id' => $user->id, 'test_id' => $test->id, 'attempt_number' => 2,
            'answers' => [], 'questions_snapshot' => [], 'score_percent' => 100, 'passed' => true,
        ]);
        $this->assertTrue($this->getJson('/api/v1/courses/z-testem-zaliczenie')->assertOk()->json('data.test_passed'));
        $this->assertTrue(CourseAccess::testPassed($user, $course->fresh('test')));
    }

    // ------------------------------------------------------------------
    // odczyt kursu: materiały lekcji zamkniętych nie są zwracane
    // ------------------------------------------------------------------

    /**
     * @param  list<Lesson>  $lessons
     * @return array<int, int> id lekcji → id jej materiału; klucz 0 = materiał kursu
     */
    private function materialsFor(Course $course, array $lessons): array
    {
        $ids = [0 => Material::create(['course_id' => $course->id, 'name' => 'Kurs', 'file_path' => 'm/k', 'mime' => 'application/pdf', 'size' => 10])->id];

        foreach ($lessons as $lesson) {
            $ids[$lesson->id] = Material::create(['lesson_id' => $lesson->id, 'name' => 'L'.$lesson->id, 'file_path' => 'm/'.$lesson->id, 'mime' => 'application/pdf', 'size' => 10])->id;
        }

        return $ids;
    }

    public function test_materials_are_present_exactly_when_the_lesson_is_not_locked(): void
    {
        [$course, $lessons] = $this->courseWithLessons(5);
        $ids = $this->materialsFor($course, $lessons);
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $this->completeLesson($user, $lessons[0]);
        $this->completeLesson($user, $lessons[3]);

        $read = $this->getJson("/api/v1/courses/{$course->slug}")->assertOk();
        $present = array_column($read->json('data.materials'), 'id');

        // 1 ukończona, 2 otwarta, 3 zamknięta, 4 ukończona, 5 otwarta (poprzednia ukończona).
        $this->assertSame([false, false, true, false, false], array_column($read->json('data.lessons'), 'locked'));
        $this->assertContains($ids[0], $present, 'Materiał kursu jest obecny.');

        foreach ($read->json('data.lessons') as $entry) {
            $this->assertSame(
                ! $entry['locked'],
                in_array($ids[$entry['id']], $present, true),
                "Lekcja {$entry['id']}: materiał obecny wtedy i tylko wtedy, gdy lekcja nie jest zamknięta.",
            );
        }

        // Po ukończeniu poprzedniej lekcji materiał pojawia się w następnym odczycie.
        $this->assertNotContains($ids[$lessons[2]->id], $present);
        $this->completeLesson($user, $lessons[1]);
        $after = array_column($this->getJson("/api/v1/courses/{$course->slug}")->assertOk()->json('data.materials'), 'id');
        $this->assertContains($ids[$lessons[2]->id], $after);
    }

    #[DataProvider('staffRoles')]
    public function test_staff_and_an_assigned_instructor_get_every_material(string $role): void
    {
        [$course, $lessons] = $this->courseWithLessons(4);
        $ids = $this->materialsFor($course, $lessons);
        $staff = User::factory()->create(['role' => $role, 'product_group' => 'psychon']);
        CourseAssignment::create(['course_id' => $course->id, 'lesson_id' => null, 'instructor_id' => $staff->id, 'assigned_by' => $staff->id, 'assigned_at' => now()]);
        $this->actingAs($staff, 'keycloak');

        $present = array_column($this->getJson("/api/v1/courses/{$course->slug}")->assertOk()->json('data.materials'), 'id');

        $this->assertEqualsCanonicalizing(array_values($ids), $present);
    }

    public function test_the_course_read_query_count_with_materials_does_not_grow_with_the_number_of_lessons(): void
    {
        $user = $this->volunteer();
        $this->actingAs($user, 'keycloak');
        $counts = [];

        foreach ([3, 30] as $n) {
            [$course, $lessons] = $this->courseWithLessons($n, withTest: true, slug: 'kurs-zapytan-pliki-'.$n);
            $this->materialsFor($course, $lessons);
            $this->getJson("/api/v1/courses/{$course->slug}")->assertOk();
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson("/api/v1/courses/{$course->slug}")->assertOk();
            $counts[$n] = count(DB::getQueryLog());
            DB::disableQueryLog();
        }

        $this->assertSame($counts[3], $counts[30], 'Odczyt kursu z materiałami: liczba zapytań nie zależy od liczby lekcji.');
    }

    // ------------------------------------------------------------------
    // pomocnicze
    // ------------------------------------------------------------------

    /**
     * Stan zapisów osoby: postęp (liczniki), pytania — do porównania przed i po odmowie.
     *
     * @return array<string, mixed>
     */
    private function writes(User $user): array
    {
        return [
            'progress' => DB::table('lesson_progress')->where('user_id', $user->id)->orderBy('id')->get()->map(fn ($r): array => (array) $r)->all(),
            'questions' => InstructorQuestion::query()->where('user_id', $user->id)->count(),
        ];
    }

    /** @param  list<Lesson>  $ordered */
    private function setOrder(array $ordered): void
    {
        // Numery parkingowe: unikat (kurs, kolejność) nie pozwala zamienić dwóch pozycji wprost.
        foreach ($ordered as $index => $lesson) {
            DB::table('lessons')->where('id', $lesson->id)->update(['sequence_order' => 1000 + $index]);
        }

        foreach ($ordered as $index => $lesson) {
            DB::table('lessons')->where('id', $lesson->id)->update(['sequence_order' => $index + 1]);
        }
    }

    private function completeLesson(User $user, Lesson $lesson): void
    {
        DB::table('lesson_progress')->updateOrInsert(
            ['user_id' => $user->id, 'lesson_id' => $lesson->id],
            [
                'position_seconds' => 0, 'watched_seconds' => 600, 'active_seconds' => 600,
                'open_count' => 1, 'last_activity_at' => null, 'is_completed' => true, 'completed_at' => now(),
                'created_at' => now(), 'updated_at' => now(),
            ],
        );
    }

    /** @return array<string, int> */
    private function answers(Test $test): array
    {
        $answers = [];

        foreach ($test->questions()->with('answers')->get() as $question) {
            $answers[(string) $question->id] = $question->answers->firstWhere('is_correct', true)->id;
        }

        return $answers;
    }

    /**
     * @return array{0: Course, 1: list<Lesson>, 2: Test|null}
     */
    private function courseWithLessons(int $count, int $order = 1, bool $withTest = false, ?string $slug = null): array
    {
        $course = Course::create([
            'title' => 'Kurs '.uniqid(),
            'slug' => $slug ?? 'kurs-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => $order,
            'edition_id' => $this->edition()->id,
            'is_published' => true,
        ]);

        $lessons = [];

        for ($i = 1; $i <= $count; $i++) {
            $lesson = Lesson::create([
                'course_id' => $course->id,
                'title' => 'Lekcja '.$i,
                'sequence_order' => $i,
                'duration_seconds' => 600,
            ]);

            $this->recordings++;
            DB::table('lessons')->where('id', $lesson->id)->update([
                'video_provider_id' => 'mock-nagranie-kolej-'.$this->recordings,
                'video_status' => 'ready',
                'video_status_at' => now(),
            ]);

            $lessons[] = $lesson->fresh();
        }

        $test = null;

        if ($withTest) {
            $test = $course->test()->create(['pass_threshold' => null, 'attempts_limit' => null, 'question_count' => 1]);
            $question = $test->questions()->create(['body' => 'Pytanie?', 'sequence_order' => 1]);
            $question->answers()->create(['body' => 'Tak', 'is_correct' => true]);
            $question->answers()->create(['body' => 'Nie', 'is_correct' => false]);
            $test = $test->fresh();
        }

        return [$course, $lessons, $test];
    }

    private function edition(): Edition
    {
        return Edition::query()->firstWhere('status', 'active') ?? Edition::create([
            'name' => 'Edycja kolejności',
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

    private function volunteer(): User
    {
        return User::factory()->create(['role' => 'volunteer', 'product_group' => 'psychon']);
    }
}
