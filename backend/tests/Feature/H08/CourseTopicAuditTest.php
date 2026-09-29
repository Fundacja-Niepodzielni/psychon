<?php

namespace Tests\Feature\H08;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Lesson;
use App\Models\User;
use App\Services\H08\TopicLayout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Audyt operacji na tematach: slug `course.updated` z rejestru (§3.2),
 * podmiotem jest kurs, rodzaj operacji w `details.op` i dokładnie jeden
 * identyfikator towarzyszący — nigdy lista. Cztery kody:
 * `topic.created`, `topic.updated`, `topic.deleted` (towarzysz `topic_id`)
 * i `topics.reordered` (towarzysz `course_id`).
 */
class CourseTopicAuditTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_topic_operation_writes_its_code_with_exactly_one_companion(): void
    {
        $course = $this->courseWithLessons();
        $admin = User::factory()->role('super_admin')->create();
        $this->actingAs($admin, 'keycloak');

        $this->assertOperationsAudited($course, $admin, '/api/v1/admin');
    }

    public function test_instructor_operations_are_audited_the_same_way(): void
    {
        $course = $this->courseWithLessons();
        $instructor = User::factory()->role('instructor')->create();
        CourseAssignment::create([
            'course_id' => $course->id,
            'lesson_id' => null,
            'instructor_id' => $instructor->id,
            'assigned_at' => now(),
        ]);
        $this->actingAs($instructor, 'keycloak');

        $this->assertOperationsAudited($course, $instructor, '/api/v1/instructor');
    }

    public function test_reading_topics_writes_no_audit(): void
    {
        $course = $this->courseWithLessons();
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->getJson("/api/v1/admin/courses/{$course->id}/topics")->assertOk();

        $this->assertSame(0, AuditLogEntry::count());
    }

    private function assertOperationsAudited(Course $course, User $actor, string $prefix): void
    {
        $default = $course->topics()->firstOrFail();

        $topic = $this->postJson("{$prefix}/courses/{$course->id}/topics", ['title' => 'Nowy'])->assertCreated()->json('data.id');
        $this->patchJson("{$prefix}/topics/{$topic}", ['title' => 'Nowy tytuł'])->assertOk();
        $this->patchJson("{$prefix}/courses/{$course->id}/topics/reorder", ['topics' => [
            ['id' => $topic, 'lesson_ids' => []],
            ['id' => $default->id, 'lesson_ids' => TopicLayout::lessonIdsOf($default)],
        ]])->assertOk();
        $this->deleteJson("{$prefix}/topics/{$topic}")->assertOk();

        $entries = AuditLogEntry::query()->orderBy('id')->get();

        $this->assertSame(
            [
                ['op' => 'topic.created', 'topic_id' => $topic],
                ['op' => 'topic.updated', 'topic_id' => $topic],
                ['op' => 'topics.reordered', 'course_id' => $course->id],
                ['op' => 'topic.deleted', 'topic_id' => $topic],
            ],
            $entries->pluck('details')->all(),
        );

        foreach ($entries as $entry) {
            $this->assertSame('course.updated', $entry->action);
            $this->assertSame($actor->id, $entry->actor_id);
            $this->assertSame($course->getMorphClass(), $entry->subject_type);
            $this->assertSame($course->id, $entry->subject_id);

            foreach ($entry->details as $value) {
                $this->assertIsNotArray($value, 'Ładunek audytu nie niesie list.');
            }
        }
    }

    private function courseWithLessons(): Course
    {
        $course = Course::create([
            'title' => 'Kurs audytu',
            'slug' => 'kurs-audytu',
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
}
