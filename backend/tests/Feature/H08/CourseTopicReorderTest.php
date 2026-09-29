<?php

namespace Tests\Feature\H08;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\CourseTopic;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\User;
use App\Services\H08\TopicLayout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Kolejność tematów i lekcji w tematach — `PATCH …/topics/reorder` przyjmuje
 * wyłącznie pełną permutację: każdy żywy temat kursu i każdą żywą lekcję
 * kursu dokładnie raz. Brak, obcy identyfikator albo duplikat daje 422
 * `validation_failed`, zero zmian i zero wpisów audytu. Spłaszczony
 * `sequence_order` idzie za tematami, a postęp zostaje nietknięty.
 *
 * Tu także reguły sąsiednie: płaska kolejność w kursie z kilkoma tematami
 * (422), usunięcie tematu z lekcjami (422 `conditions_not_met`) i
 * niezmiennik „żadna żywa lekcja bez tematu".
 */
class CourseTopicReorderTest extends TestCase
{
    use RefreshDatabase;

    public function test_full_permutation_moves_topics_and_lessons_and_is_audited_once(): void
    {
        [$course, $first, $second, $lessons] = $this->courseWithTwoTopics();
        $this->actingAsAdmin();

        // Drugi temat na początek, lekcja C przeniesiona do pierwszego tematu.
        $response = $this->patchJson($this->reorderUrl($course), ['topics' => [
            ['id' => $second->id, 'lesson_ids' => [$lessons['D']]],
            ['id' => $first->id, 'lesson_ids' => [$lessons['C'], $lessons['B'], $lessons['A']]],
        ]])->assertOk();

        $this->assertSame([$second->id, $first->id], array_column($response->json('data'), 'id'));
        $this->assertSame([1, 2], array_column($response->json('data'), 'position'));
        $this->assertSame([[$lessons['D']], [$lessons['C'], $lessons['B'], $lessons['A']]], array_column($response->json('data'), 'lesson_ids'));

        $this->assertSame(
            [
                [$lessons['D'], $second->id, 1, 1],
                [$lessons['C'], $first->id, 1, 2],
                [$lessons['B'], $first->id, 2, 3],
                [$lessons['A'], $first->id, 3, 4],
            ],
            $this->layoutRows($course),
        );

        $this->assertSame(1, AuditLogEntry::query()->where('action', 'course.updated')->count());
    }

    public function test_partial_foreign_and_duplicated_lists_are_rejected_and_change_nothing(): void
    {
        [$course, $first, $second, $lessons] = $this->courseWithTwoTopics();
        $other = $this->courseWithLessons('obcy', ['X']);
        $foreignLesson = Lesson::query()->where('course_id', $other->id)->value('id');
        $foreignTopic = $other->topics()->value('id');
        $this->actingAsAdmin();

        $before = $this->layoutRows($course);
        $topicsBefore = $this->topicRows($course);

        $invalid = [
            'brak lekcji' => [
                ['id' => $first->id, 'lesson_ids' => [$lessons['A'], $lessons['B']]],
                ['id' => $second->id, 'lesson_ids' => [$lessons['D']]],
            ],
            'brak tematu' => [
                ['id' => $first->id, 'lesson_ids' => [$lessons['A'], $lessons['B'], $lessons['C'], $lessons['D']]],
            ],
            'obca lekcja' => [
                ['id' => $first->id, 'lesson_ids' => [$lessons['A'], $lessons['B'], $lessons['C'], $foreignLesson]],
                ['id' => $second->id, 'lesson_ids' => [$lessons['D']]],
            ],
            'obcy temat' => [
                ['id' => $first->id, 'lesson_ids' => [$lessons['A'], $lessons['B'], $lessons['C']]],
                ['id' => $second->id, 'lesson_ids' => [$lessons['D']]],
                ['id' => $foreignTopic, 'lesson_ids' => []],
            ],
            'duplikat lekcji w dwóch tematach' => [
                ['id' => $first->id, 'lesson_ids' => [$lessons['A'], $lessons['B'], $lessons['C']]],
                ['id' => $second->id, 'lesson_ids' => [$lessons['D'], $lessons['A']]],
            ],
            'duplikat tematu' => [
                ['id' => $first->id, 'lesson_ids' => [$lessons['A'], $lessons['B'], $lessons['C']]],
                ['id' => $first->id, 'lesson_ids' => [$lessons['D']]],
            ],
        ];

        foreach ($invalid as $case => $topics) {
            $response = $this->patchJson($this->reorderUrl($course), ['topics' => $topics]);

            $this->assertSame(422, $response->status(), $case);
            $this->assertSame('validation_failed', $response->json('error.code'), $case);
            $this->assertNotEmpty($response->json('error.errors'), $case);
        }

        $this->assertSame($before, $this->layoutRows($course));
        $this->assertSame($topicsBefore, $this->topicRows($course));
        $this->assertSame(0, AuditLogEntry::count());
    }

    public function test_a_partial_lesson_list_is_named_under_topics(): void
    {
        [$course, $first, $second, $lessons] = $this->courseWithTwoTopics();
        $this->actingAsAdmin();

        $this->patchJson($this->reorderUrl($course), ['topics' => [
            ['id' => $first->id, 'lesson_ids' => [$lessons['A']]],
            ['id' => $second->id, 'lesson_ids' => [$lessons['D']]],
        ]])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['topics']]]);

        $this->assertSame(0, AuditLogEntry::count());
    }

    public function test_martas_progress_in_course_two_is_the_same_before_and_after_reordering(): void
    {
        $this->seed();
        $course = Course::where('slug', 'wywiad-psychologiczny')->firstOrFail();
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $progressBefore = $this->progressSnapshot();
        $this->assertSame(40, $this->progressPercent($marta));

        $admin = $this->actingAsAdmin();
        $default = $course->topics()->firstOrFail();
        $lessons = TopicLayout::lessonIdsOf($default);
        $second = $this->postJson("/api/v1/admin/courses/{$course->id}/topics", ['title' => 'Druga część'])
            ->assertCreated()
            ->json('data.id');

        $this->patchJson($this->reorderUrl($course), ['topics' => [
            ['id' => $second, 'lesson_ids' => array_reverse(array_slice($lessons, 3))],
            ['id' => $default->id, 'lesson_ids' => array_reverse(array_slice($lessons, 0, 3))],
        ]])->assertOk();

        $this->assertSame($progressBefore, $this->progressSnapshot());
        $this->assertSame(40, $this->progressPercent($marta));
        $this->assertSame(2, AuditLogEntry::query()->where('actor_id', $admin->id)->count());
    }

    public function test_flat_order_is_refused_in_a_course_with_several_topics(): void
    {
        [$course, , , $lessons] = $this->courseWithTwoTopics();
        $this->actingAsAdmin();
        $before = $this->layoutRows($course);

        $this->patchJson("/api/v1/admin/courses/{$course->id}/lessons/reorder", [
            'lesson_ids' => [$lessons['D'], $lessons['C'], $lessons['B'], $lessons['A']],
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['lesson_ids']]]);

        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Lekcja z numerem',
            'sequence_order' => 9,
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['sequence_order']]]);

        $this->patchJson("/api/v1/admin/lessons/{$lessons['A']}", ['sequence_order' => 4])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame($before, $this->layoutRows($course));
        $this->assertSame(0, AuditLogEntry::count());
    }

    public function test_flat_order_in_a_single_topic_course_rewrites_topic_positions(): void
    {
        $course = $this->courseWithLessons('jeden-temat', ['A', 'B', 'C']);
        $ids = Lesson::query()->where('course_id', $course->id)->orderBy('sequence_order')->pluck('id')->all();
        $topic = $course->topics()->firstOrFail();
        $this->actingAsAdmin();

        $this->patchJson("/api/v1/admin/courses/{$course->id}/lessons/reorder", [
            'lesson_ids' => [$ids[2], $ids[0], $ids[1]],
        ])->assertOk();

        $this->assertSame([$ids[2], $ids[0], $ids[1]], TopicLayout::lessonIdsOf($topic));
        $this->assertSame(
            [[$ids[2], $topic->id, 1, 1], [$ids[0], $topic->id, 2, 2], [$ids[1], $topic->id, 3, 3]],
            $this->layoutRows($course),
        );
    }

    public function test_a_new_lesson_goes_to_the_chosen_topic_and_the_flat_order_follows_topics(): void
    {
        [$course, $first, $second, $lessons] = $this->courseWithTwoTopics();
        $this->actingAsAdmin();

        $created = $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Nowa w pierwszym temacie',
            'topic_id' => $first->id,
        ])->assertCreated()
            ->assertJsonPath('data.topic_id', $first->id)
            ->assertJsonPath('data.topic_position', 4)
            ->json('data.id');

        $this->assertSame(
            [
                [$lessons['A'], $first->id, 1, 1],
                [$lessons['B'], $first->id, 2, 2],
                [$lessons['C'], $first->id, 3, 3],
                [$created, $first->id, 4, 4],
                [$lessons['D'], $second->id, 1, 5],
            ],
            $this->layoutRows($course),
        );

        $withoutTopic = $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", ['title' => 'Bez tematu'])
            ->assertCreated()
            ->assertJsonPath('data.topic_id', $second->id)
            ->assertJsonPath('data.topic_position', 2)
            ->json('data.id');
        $this->assertSame(6, Lesson::query()->findOrFail($withoutTopic)->sequence_order);
    }

    public function test_a_topic_of_another_course_is_refused_for_a_new_lesson(): void
    {
        [$course] = $this->courseWithTwoTopics();
        $other = $this->courseWithLessons('obcy', ['X']);
        $this->actingAsAdmin();
        $count = Lesson::query()->count();

        foreach ([$other->topics()->value('id'), (int) CourseTopic::query()->max('id') + 1000] as $topicId) {
            $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", ['title' => 'X', 'topic_id' => $topicId])
                ->assertStatus(422)
                ->assertJsonPath('error.code', 'validation_failed')
                ->assertJsonStructure(['error' => ['errors' => ['topic_id']]]);
        }

        $this->assertSame($count, Lesson::query()->count());
    }

    public function test_lesson_edit_may_not_move_a_lesson_between_topics(): void
    {
        [, , $second, $lessons] = $this->courseWithTwoTopics();
        $this->actingAsAdmin();

        $this->patchJson("/api/v1/admin/lessons/{$lessons['A']}", ['topic_id' => $second->id, 'topic_position' => 1])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['topic_id', 'topic_position']]]);
    }

    public function test_deleting_a_topic_with_lessons_is_refused(): void
    {
        [$course, $first] = $this->courseWithTwoTopics();
        $this->actingAsAdmin();

        $this->deleteJson("/api/v1/admin/topics/{$first->id}")
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'conditions_not_met');

        $this->assertNotNull($first->fresh());
        $this->assertNull($first->fresh()->deleted_at);
        $this->assertSame(2, $course->topics()->count());
        $this->assertSame(0, AuditLogEntry::count());
    }

    public function test_deleting_an_empty_topic_closes_the_gap_in_positions(): void
    {
        [$course, $first, $second] = $this->courseWithTwoTopics();
        $this->actingAsAdmin();
        $third = $this->postJson("/api/v1/admin/courses/{$course->id}/topics", ['title' => 'Trzeci'])->json('data.id');
        $emptyMiddle = $this->postJson("/api/v1/admin/courses/{$course->id}/topics", ['title' => 'Pusty'])->json('data.id');

        $this->patchJson($this->reorderUrl($course), ['topics' => [
            ['id' => $first->id, 'lesson_ids' => TopicLayout::lessonIdsOf($first)],
            ['id' => $emptyMiddle, 'lesson_ids' => []],
            ['id' => $second->id, 'lesson_ids' => TopicLayout::lessonIdsOf($second)],
            ['id' => $third, 'lesson_ids' => []],
        ]])->assertOk();

        $this->deleteJson("/api/v1/admin/topics/{$emptyMiddle}")->assertOk();

        $this->assertSame(
            [[$first->id, 1], [$second->id, 2], [$third, 3]],
            $this->topicRows($course),
        );
    }

    public function test_no_live_lesson_is_left_without_a_topic_after_topic_operations(): void
    {
        $this->seed();
        $course = Course::where('slug', 'podstawy-pomocy')->firstOrFail();
        $this->actingAsAdmin();

        $default = $course->topics()->firstOrFail();
        $lessons = TopicLayout::lessonIdsOf($default);
        $second = $this->postJson("/api/v1/admin/courses/{$course->id}/topics", ['title' => 'Część druga'])->json('data.id');
        $this->patchJson($this->reorderUrl($course), ['topics' => [
            ['id' => $default->id, 'lesson_ids' => array_slice($lessons, 0, 3)],
            ['id' => $second, 'lesson_ids' => array_slice($lessons, 3)],
        ]])->assertOk();
        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", ['title' => 'Nowa'])->assertCreated();
        $this->deleteJson("/api/v1/admin/topics/{$second}")->assertStatus(422);

        $this->assertSame(0, Lesson::query()->whereDoesntHave('topic')->count());
    }

    /**
     * Kurs z tematem domyślnym (lekcje A, B, C) i drugim tematem (lekcja D),
     * zbudowany przez trasy tematów.
     *
     * @return array{0: Course, 1: CourseTopic, 2: CourseTopic, 3: array<string, int>}
     */
    private function courseWithTwoTopics(): array
    {
        $course = $this->courseWithLessons('dwa-tematy', ['A', 'B', 'C', 'D']);
        $first = $course->topics()->firstOrFail();
        $lessons = Lesson::query()->where('course_id', $course->id)->orderBy('sequence_order')->pluck('id', 'title')->map(fn ($id): int => (int) $id)->all();

        DB::transaction(function () use ($course): void {
            $second = CourseTopic::create(['course_id' => $course->id, 'title' => 'Drugi', 'position' => 2]);
            $lessons = Lesson::query()->where('course_id', $course->id)->orderBy('sequence_order')->pluck('id')->all();
            TopicLayout::placeLessons([
                [$course->topics()->firstOrFail()->id, array_slice($lessons, 0, 3)],
                [$second->id, array_slice($lessons, 3)],
            ]);
        });

        return [$course, $first, $course->topics()->where('position', 2)->firstOrFail(), $lessons];
    }

    /**
     * @param  list<string>  $titles
     */
    private function courseWithLessons(string $slug, array $titles): Course
    {
        $course = Course::create([
            'title' => 'Kurs '.$slug,
            'slug' => $slug,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'is_published' => false,
        ]);

        foreach ($titles as $index => $title) {
            Lesson::create([
                'course_id' => $course->id,
                'title' => $title,
                'sequence_order' => $index + 1,
                'duration_seconds' => 600,
            ]);
        }

        TopicLayout::adoptOrphans($course);

        return $course;
    }

    /**
     * Wiersze lekcji w kolejności płaskiej: [id, topic_id, topic_position, sequence_order].
     *
     * @return list<array{0: int, 1: int, 2: int, 3: int}>
     */
    private function layoutRows(Course $course): array
    {
        return Lesson::query()
            ->where('course_id', $course->id)
            ->orderBy('sequence_order')
            ->get()
            ->map(fn (Lesson $lesson): array => [$lesson->id, $lesson->topic_id, $lesson->topic_position, $lesson->sequence_order])
            ->all();
    }

    /**
     * @return list<array{0: int, 1: int}>
     */
    private function topicRows(Course $course): array
    {
        return $course->topics()->get()->map(fn (CourseTopic $topic): array => [$topic->id, $topic->position])->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function progressSnapshot(): array
    {
        return LessonProgress::query()->orderBy('id')->get()->map(fn (LessonProgress $row): array => $row->getAttributes())->all();
    }

    private function progressPercent(User $user): int
    {
        $this->actingAs($user, 'keycloak');

        return (int) $this->getJson('/api/v1/courses/wywiad-psychologiczny')->assertOk()->json('data.progress_percent');
    }

    private function reorderUrl(Course $course): string
    {
        return "/api/v1/admin/courses/{$course->id}/topics/reorder";
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->role('super_admin')->create();
        $this->actingAs($admin, 'keycloak');

        return $admin;
    }
}
