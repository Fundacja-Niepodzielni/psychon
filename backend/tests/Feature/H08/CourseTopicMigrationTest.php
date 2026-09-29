<?php

namespace Tests\Feature\H08;

use App\Models\Course;
use App\Models\CourseTopic;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Migracja warstwy tematów na zaseedowanej bazie: tylko dodaje, cofa się
 * bez śladu i uzupełnia jeden temat domyślny na kurs z lekcjami, z
 * pozycjami lekcji równymi ich randze po `sequence_order, id`. Postęp
 * (`lesson_progress`) i wiersze lekcji są identyczne przed i po.
 *
 * Oczekiwane liczby pochodzą z kanonicznego seeda
 * (`docs/hackathon/04-seed-demo.md`): 11 kursów z lekcjami, marta ma 40 %
 * w kursie 2.
 */
class CourseTopicMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const string MIGRATION = 'database/migrations/2026_09_29_110000_create_course_topics_table.php';

    /** Kolumny lekcji sprzed migracji — bez `topic_id` i `topic_position`. */
    private const array LESSON_COLUMNS = [
        'id', 'course_id', 'title', 'description', 'sequence_order', 'video_provider_id',
        'duration_seconds', 'created_at', 'updated_at', 'deleted_at',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_default_topic_title_is_the_decided_value(): void
    {
        $this->assertSame('Lekcje kursu', CourseTopic::DEFAULT_TITLE);
    }

    public function test_rollback_and_migrate_keep_lessons_and_progress_and_backfill_one_topic_per_course(): void
    {
        // Lekcja usunięta miękko: migracja przypina ją do tematu bez pozycji.
        $removed = Lesson::query()->where('course_id', $this->courseId(4))->orderByDesc('sequence_order')->firstOrFail();
        $removed->delete();

        $progressBefore = $this->progressSnapshot();
        $lessonsBefore = $this->lessonSnapshot();
        $this->assertGreaterThan(0, count($progressBefore));
        $this->assertSame(40, $this->martaProgressInCourseTwo());

        $this->assertSame(0, $this->artisan('migrate:rollback', ['--path' => self::MIGRATION])->run());

        $this->assertFalse(Schema::hasTable('course_topics'));
        $this->assertFalse(Schema::hasColumn('lessons', 'topic_id'));
        $this->assertFalse(Schema::hasColumn('lessons', 'topic_position'));
        $this->assertSame($progressBefore, $this->progressSnapshot());
        $this->assertSame($lessonsBefore, $this->lessonSnapshot());

        $this->assertSame(0, $this->artisan('migrate', ['--path' => self::MIGRATION])->run());

        $this->assertSame($progressBefore, $this->progressSnapshot());
        $this->assertSame($lessonsBefore, $this->lessonSnapshot());

        // Jeden temat domyślny na każdy kurs mający wiersz lekcji (seed: 11).
        $coursesWithLessons = DB::table('lessons')->distinct()->orderBy('course_id')->pluck('course_id')->all();
        $this->assertCount(11, $coursesWithLessons);
        $topics = DB::table('course_topics')->orderBy('course_id')->get();
        $this->assertSame($coursesWithLessons, $topics->pluck('course_id')->all());
        foreach ($topics as $topic) {
            $this->assertSame(CourseTopic::DEFAULT_TITLE, $topic->title);
            $this->assertSame(1, (int) $topic->position);
        }

        // Każda lekcja w temacie swojego kursu; żywa z pozycją = ranga po
        // `sequence_order, id`, usunięta miękko bez pozycji.
        $topicByCourse = $topics->pluck('id', 'course_id');
        foreach ($coursesWithLessons as $courseId) {
            $rows = DB::table('lessons')->where('course_id', $courseId)->orderBy('sequence_order')->orderBy('id')->get();
            $rank = 0;
            foreach ($rows as $row) {
                $this->assertSame((int) $topicByCourse[$courseId], (int) $row->topic_id);
                if ($row->deleted_at === null) {
                    $this->assertSame(++$rank, (int) $row->topic_position);
                } else {
                    $this->assertNull($row->topic_position);
                }
            }
        }
        $this->assertNull(DB::table('lessons')->where('id', $removed->id)->value('topic_position'));

        $this->assertSame(40, $this->martaProgressInCourseTwo());
    }

    public function test_every_seeded_live_lesson_belongs_to_a_live_topic_of_its_course(): void
    {
        $this->assertSame(0, Lesson::query()->whereDoesntHave('topic')->count());
        $this->assertSame(
            0,
            Lesson::query()->whereHas('topic', fn ($topic) => $topic->whereColumn('course_topics.course_id', '!=', 'lessons.course_id'))->count(),
        );
        $this->assertSame(11, CourseTopic::query()->count());
        $this->assertSame([CourseTopic::DEFAULT_TITLE], CourseTopic::query()->distinct()->pluck('title')->all());
    }

    public function test_seeded_topic_positions_are_unique_and_follow_the_course_order(): void
    {
        foreach (Course::query()->has('lessons')->get() as $course) {
            $flat = $course->lessons()->orderBy('id')->pluck('topic_position')->all();
            $this->assertSame(range(1, count($flat)), $flat, "Kurs {$course->slug}");
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function progressSnapshot(): array
    {
        return DB::table('lesson_progress')->orderBy('id')->get()->map(fn ($row): array => (array) $row)->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function lessonSnapshot(): array
    {
        return DB::table('lessons')->orderBy('id')->get(self::LESSON_COLUMNS)->map(fn ($row): array => (array) $row)->all();
    }

    private function courseId(int $sequenceOrder): int
    {
        return (int) Course::query()->where('sequence_order', $sequenceOrder)->value('id');
    }

    private function martaProgressInCourseTwo(): int
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $this->actingAs($marta, 'keycloak');

        return (int) $this->getJson('/api/v1/courses/wywiad-psychologiczny')->assertOk()->json('data.progress_percent');
    }
}
