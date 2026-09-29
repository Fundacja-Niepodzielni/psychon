<?php

namespace Tests\Feature\H08;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\CourseTopic;
use App\Models\Lesson;
use App\Models\User;
use App\Services\H08\TopicLayout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Dostęp do tras tematów kursu. Administracja i prowadzący własnego kursu
 * piszą; dla prowadzącego kurs albo temat obcy wygląda na zewnątrz
 * identycznie jak nieistniejący (ten sam status i całe ciało odpowiedzi,
 * także przy niepoprawnym ciele żądania); inna rola dostaje 403
 * `forbidden`, gość 401 `unauthenticated` (kontrakt §1.1).
 */
class CourseTopicAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_uses_every_topic_route(): void
    {
        $this->exerciseEveryRoute('/api/v1/admin', $this->courseWithLessons('etap-1'), $this->actingAsRole('super_admin'));
    }

    public function test_project_manager_uses_every_topic_route(): void
    {
        $this->exerciseEveryRoute('/api/v1/admin', $this->courseWithLessons('etap-1'), $this->actingAsRole('project_manager'));
    }

    public function test_assigned_instructor_uses_every_topic_route_on_own_course(): void
    {
        $course = $this->courseWithLessons('etap-1');
        $instructor = $this->assignedInstructor($course);
        $this->actingAs($instructor, 'keycloak');

        $this->exerciseEveryRoute('/api/v1/instructor', $course, $instructor);
    }

    public function test_foreign_and_missing_course_or_topic_look_identical_to_an_instructor(): void
    {
        $foreign = $this->courseWithLessons('cudzy');
        $this->assignedInstructor($foreign);
        $foreignTopic = $foreign->topics()->firstOrFail();

        $own = $this->courseWithLessons('wlasny');
        $instructor = $this->assignedInstructor($own);
        $this->actingAs($instructor, 'keycloak');

        $missingCourse = (int) Course::query()->max('id') + 1000;
        $missingTopic = (int) CourseTopic::query()->max('id') + 1000;
        $reorder = ['topics' => [['id' => $foreignTopic->id, 'lesson_ids' => TopicLayout::lessonIdsOf($foreignTopic)]]];

        $routes = [
            ['GET', "courses/{$foreign->id}/topics", "courses/{$missingCourse}/topics", []],
            ['POST', "courses/{$foreign->id}/topics", "courses/{$missingCourse}/topics", ['title' => 'Nowy temat']],
            ['PATCH', "courses/{$foreign->id}/topics/reorder", "courses/{$missingCourse}/topics/reorder", $reorder],
            ['PATCH', "topics/{$foreignTopic->id}", "topics/{$missingTopic}", ['title' => 'Zmieniony']],
            ['DELETE', "topics/{$foreignTopic->id}", "topics/{$missingTopic}", []],
        ];

        foreach ($routes as [$method, $foreignPath, $missingPath, $body]) {
            $foreignResponse = $this->json($method, "/api/v1/instructor/{$foreignPath}", $body);
            $missingResponse = $this->json($method, "/api/v1/instructor/{$missingPath}", $body);

            $this->assertSame(404, $foreignResponse->status(), "{$method} {$foreignPath}");
            $this->assertSame(404, $missingResponse->status(), "{$method} {$missingPath}");
            $this->assertSame('not_found', $foreignResponse->json('error.code'));
            $this->assertSame($missingResponse->json(), $foreignResponse->json(), "{$method} {$foreignPath}");
        }

        $this->assertSame(1, $foreign->topics()->count());
        $this->assertSame(CourseTopic::DEFAULT_TITLE, $foreignTopic->fresh()->title);
        $this->assertSame(0, AuditLogEntry::count());
    }

    public function test_invalid_body_on_a_foreign_resource_is_404_and_writes_nothing(): void
    {
        $foreign = $this->courseWithLessons('cudzy');
        $this->assignedInstructor($foreign);
        $foreignTopic = $foreign->topics()->firstOrFail();

        $this->actingAs($this->assignedInstructor($this->courseWithLessons('wlasny')), 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$foreign->id}/topics", [])
            ->assertStatus(404)->assertJsonPath('error.code', 'not_found');
        $this->patchJson("/api/v1/instructor/topics/{$foreignTopic->id}", ['title' => str_repeat('x', 300)])
            ->assertStatus(404)->assertJsonPath('error.code', 'not_found');
        $this->patchJson("/api/v1/instructor/courses/{$foreign->id}/topics/reorder", ['topics' => 'nie-lista'])
            ->assertStatus(404)->assertJsonPath('error.code', 'not_found');

        $this->assertSame(1, $foreign->topics()->count());
        $this->assertSame(CourseTopic::DEFAULT_TITLE, $foreignTopic->fresh()->title);
        $this->assertSame(1, $foreignTopic->fresh()->position);
        $this->assertSame(0, AuditLogEntry::count());
    }

    public function test_the_same_invalid_body_on_an_own_course_is_a_validation_error(): void
    {
        $course = $this->courseWithLessons('wlasny');
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->postJson("/api/v1/instructor/courses/{$course->id}/topics", [])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['title']]]);
    }

    public function test_participant_is_forbidden_on_write_routes_whether_the_id_exists_or_not(): void
    {
        $course = $this->courseWithLessons('etap-1');
        $topic = $course->topics()->firstOrFail();
        $missingCourse = (int) Course::query()->max('id') + 1000;
        $missingTopic = (int) CourseTopic::query()->max('id') + 1000;

        $this->actingAsRole('volunteer');

        foreach (['admin', 'instructor'] as $prefix) {
            foreach ([
                ['POST', 'courses/%d/topics', $course->id, $missingCourse, ['title' => 'X']],
                ['PATCH', 'courses/%d/topics/reorder', $course->id, $missingCourse, ['topics' => []]],
                ['PATCH', 'topics/%d', $topic->id, $missingTopic, ['title' => 'X']],
                ['DELETE', 'topics/%d', $topic->id, $missingTopic, []],
            ] as [$method, $pattern, $existing, $missing, $body]) {
                $existingResponse = $this->json($method, "/api/v1/{$prefix}/".sprintf($pattern, $existing), $body);
                $missingResponse = $this->json($method, "/api/v1/{$prefix}/".sprintf($pattern, $missing), $body);

                $this->assertSame(403, $existingResponse->status(), "{$prefix} {$method} {$pattern}");
                $this->assertSame('forbidden', $existingResponse->json('error.code'));
                $this->assertSame($existingResponse->json(), $missingResponse->json());
            }
        }

        $this->assertSame(1, $course->topics()->count());
        $this->assertSame(0, AuditLogEntry::count());
    }

    public function test_instructor_is_forbidden_on_admin_topic_routes(): void
    {
        $course = $this->courseWithLessons('etap-1');
        $this->actingAs($this->assignedInstructor($course), 'keycloak');

        $this->postJson("/api/v1/admin/courses/{$course->id}/topics", ['title' => 'X'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_guest_is_unauthenticated(): void
    {
        $course = $this->courseWithLessons('etap-1');

        $this->getJson("/api/v1/admin/courses/{$course->id}/topics")
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
        $this->postJson("/api/v1/instructor/courses/{$course->id}/topics", ['title' => 'X'])
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    private function exerciseEveryRoute(string $prefix, Course $course, User $actor): void
    {
        $default = $course->topics()->firstOrFail();

        $this->getJson("{$prefix}/courses/{$course->id}/topics")
            ->assertOk()
            ->assertJsonPath('data.0.id', $default->id)
            ->assertJsonPath('data.0.lesson_ids', TopicLayout::lessonIdsOf($default));

        $created = $this->postJson("{$prefix}/courses/{$course->id}/topics", ['title' => 'Drugi temat'])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Drugi temat')
            ->assertJsonPath('data.position', 2)
            ->assertJsonPath('data.lesson_ids', [])
            ->json('data.id');

        $this->patchJson("{$prefix}/topics/{$created}", ['title' => 'Drugi temat — nowy tytuł'])
            ->assertOk()
            ->assertJsonPath('data.title', 'Drugi temat — nowy tytuł');

        $lessons = TopicLayout::lessonIdsOf($default);
        $this->patchJson("{$prefix}/courses/{$course->id}/topics/reorder", ['topics' => [
            ['id' => $created, 'lesson_ids' => [$lessons[1]]],
            ['id' => $default->id, 'lesson_ids' => [$lessons[0]]],
        ]])->assertOk()
            ->assertJsonPath('data.0.id', $created)
            ->assertJsonPath('data.1.id', $default->id);

        $this->patchJson("{$prefix}/courses/{$course->id}/topics/reorder", ['topics' => [
            ['id' => $default->id, 'lesson_ids' => $lessons],
            ['id' => $created, 'lesson_ids' => []],
        ]])->assertOk();

        $this->deleteJson("{$prefix}/topics/{$created}")
            ->assertOk()
            ->assertExactJson(['data' => ['id' => $created, 'deleted' => true]]);

        $this->assertSame(5, AuditLogEntry::query()->where('actor_id', $actor->id)->where('action', 'course.updated')->count());
    }

    private function courseWithLessons(string $slug): Course
    {
        $course = Course::create([
            'title' => 'Kurs '.$slug,
            'slug' => $slug,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'is_published' => false,
        ]);

        foreach ([1, 2] as $order) {
            Lesson::create([
                'course_id' => $course->id,
                'title' => "Lekcja {$order}",
                'sequence_order' => $order,
                'duration_seconds' => 600,
            ]);
        }

        TopicLayout::adoptOrphans($course);

        return $course;
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

    private function actingAsRole(string $role): User
    {
        $user = User::factory()->role($role)->create();
        $this->actingAs($user, 'keycloak');

        return $user;
    }
}
