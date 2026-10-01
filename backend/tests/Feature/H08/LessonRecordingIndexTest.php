<?php

namespace Tests\Feature\H08;

use App\Exceptions\ApiException;
use App\Models\Course;
use App\Models\CourseTopic;
use App\Models\Lesson;
use App\Models\User;
use App\Services\H08\LessonWriter;
use App\Services\H08\RecordingIdIndex;
use Closure;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

/**
 * Indeks częściowy `lessons_video_provider_id_unique`: jedno nagranie należy do
 * jednej żywej lekcji, bez rozróżniania wielkości liter. Próby idą wprost na
 * bazie (wstawienia poza modelem i poza regułami żądania), na serwisie zapisu
 * (wyścig, który przeszedł regułę żądania) i na migracji (założenie, cofnięcie,
 * zatrzymanie przy powtórzeniu).
 *
 * Wstawienie, które baza ma odrzucić, idzie w `DB::transaction` — w próbie to
 * punkt zapisu, więc odrzucone wstawienie nie unieważnia transakcji próby.
 */
class LessonRecordingIndexTest extends TestCase
{
    use RefreshDatabase;

    private const string INDEX = 'lessons_video_provider_id_unique';

    private const string MIGRATION = 'database/migrations/2026_10_01_205639_add_unique_recording_id_index_to_lessons.php';

    private const string TAKEN_MESSAGE = 'Ten identyfikator nagrania jest już przypisany do innej lekcji.';

    private int $order = 0;

    public function test_the_database_refuses_a_second_live_lesson_with_the_same_id(): void
    {
        $course = $this->course('etap-1');
        $this->insertLesson($course, 'mock-nagranie');

        $this->assertIndexRefuses(fn () => $this->insertLesson($course, 'mock-nagranie'));
        $this->assertIndexRefuses(fn () => $this->insertLesson($this->course('etap-2'), 'mock-nagranie'));

        $this->assertSame(1, DB::table('lessons')->where('video_provider_id', 'mock-nagranie')->count());
    }

    public function test_the_database_refuses_an_id_differing_only_by_letter_case(): void
    {
        $course = $this->course('etap-1');
        $this->insertLesson($course, 'mock-nagranie');

        $this->assertIndexRefuses(fn () => $this->insertLesson($course, 'MOCK-NAGRANIE'));
        $this->assertIndexRefuses(fn () => $this->insertLesson($course, 'Mock-Nagranie'));

        $this->assertSame(['mock-nagranie'], DB::table('lessons')->pluck('video_provider_id')->all());
    }

    public function test_the_database_refuses_a_save_that_makes_two_live_lessons_share_an_id(): void
    {
        $course = $this->course('etap-1');
        $this->insertLesson($course, 'mock-zajete');
        $second = $this->insertLesson($course, 'mock-wlasne');

        $this->assertIndexRefuses(fn () => DB::table('lessons')->where('id', $second)->update(['video_provider_id' => 'MOCK-ZAJETE']));

        $this->assertSame('mock-wlasne', DB::table('lessons')->where('id', $second)->value('video_provider_id'));
    }

    public function test_many_live_lessons_may_have_no_recording(): void
    {
        $course = $this->course('etap-1');

        foreach ([null, null, null, '', '', ''] as $empty) {
            $this->insertLesson($course, $empty);
        }

        $this->assertSame(6, DB::table('lessons')->where('course_id', $course->id)->count());
    }

    public function test_the_id_of_a_deleted_lesson_is_free(): void
    {
        $course = $this->course('etap-1');
        $this->insertLesson($course, 'mock-nagranie', deleted: true);
        $this->insertLesson($course, 'MOCK-NAGRANIE', deleted: true);

        $live = $this->insertLesson($course, 'mock-nagranie');

        $this->assertSame(3, DB::table('lessons')->where('course_id', $course->id)->count());
        $this->assertNull(DB::table('lessons')->where('id', $live)->value('deleted_at'));
        $this->assertIndexRefuses(fn () => $this->insertLesson($course, 'mock-nagranie'));
    }

    public function test_a_deleted_lesson_cannot_be_restored_over_a_live_lesson_holding_its_id(): void
    {
        $course = $this->course('etap-1');
        // Numery lekcji w kursie różne (wstawienie zwiększa licznik), żeby
        // przywrócenie naruszało wyłącznie indeks nagrania, a nie indeks kolejności.
        $deleted = Lesson::withTrashed()->findOrFail($this->insertLesson($course, 'mock-nagranie', deleted: true));
        $this->insertLesson($course, 'MOCK-NAGRANIE');

        $this->assertIndexRefuses(fn () => $deleted->restore());

        $this->assertTrue(Lesson::withTrashed()->findOrFail($deleted->id)->trashed());
    }

    public function test_the_index_is_partial_and_counts_the_lower_case_form(): void
    {
        $definition = (string) DB::table('pg_indexes')
            ->where('tablename', 'lessons')
            ->where('indexname', self::INDEX)
            ->value('indexdef');

        $this->assertStringStartsWith('CREATE UNIQUE INDEX '.self::INDEX.' ON ', $definition);
        $this->assertStringContainsString('lower(', $definition);
        $this->assertStringContainsString('video_provider_id', $definition);
        $this->assertStringContainsString('deleted_at IS NULL', $definition);
        $this->assertStringContainsString('video_provider_id IS NOT NULL', $definition);
    }

    public function test_a_write_that_lost_the_race_after_the_request_rule_is_refused_by_the_service(): void
    {
        $course = $this->course('etap-1');
        $actor = User::factory()->role('super_admin')->create();
        $lesson = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja z nagraniem',
            'sequence_order' => 1,
            'duration_seconds' => 1800,
            'video_provider_id' => 'mock-wlasne',
        ]);
        $this->insertLesson($this->course('etap-2'), 'mock-zajete');
        $auditBefore = DB::table('audit_log')->count();

        foreach (['mock-zajete', 'MOCK-ZAJETE', '  Mock-Zajete '] as $competing) {
            try {
                LessonWriter::update(Lesson::findOrFail($lesson->id), ['title' => 'Tytuł, który nie może się zapisać', 'video_provider_id' => $competing], $actor);
                $this->fail('Zapis przegranego wyścigu powinien zostać odrzucony.');
            } catch (ApiException $e) {
                $this->assertSame(422, $e->status);
                $this->assertSame('validation_failed', $e->errorCode);
                $this->assertSame('Popraw zaznaczone pola.', $e->getMessage());
                $this->assertSame(['video_provider_id' => [self::TAKEN_MESSAGE]], $e->errors);
            }
        }

        $fresh = Lesson::findOrFail($lesson->id);
        $this->assertSame('mock-wlasne', $fresh->video_provider_id);
        $this->assertSame('Lekcja z nagraniem', $fresh->title);
        $this->assertSame($auditBefore, DB::table('audit_log')->count());
    }

    public function test_a_create_that_lost_the_race_after_the_request_rule_is_refused_by_the_service(): void
    {
        $course = $this->course('etap-1');
        $actor = User::factory()->role('super_admin')->create();
        $this->insertLesson($this->course('etap-2'), 'mock-zajete');
        $auditBefore = DB::table('audit_log')->count();

        foreach (['mock-zajete', 'MOCK-ZAJETE'] as $competing) {
            try {
                LessonWriter::create($course, ['title' => 'Nowa lekcja', 'video_provider_id' => $competing], $actor);
                $this->fail('Zapis przegranego wyścigu powinien zostać odrzucony.');
            } catch (ApiException $e) {
                $this->assertSame(422, $e->status);
                $this->assertSame('validation_failed', $e->errorCode);
                $this->assertSame(['video_provider_id' => [self::TAKEN_MESSAGE]], $e->errors);
            }
        }

        $this->assertSame(0, Lesson::where('course_id', $course->id)->count());
        $this->assertSame(0, CourseTopic::where('course_id', $course->id)->count());
        $this->assertSame($auditBefore, DB::table('audit_log')->count());
    }

    public function test_a_violation_of_another_lesson_index_is_not_reported_as_a_taken_recording(): void
    {
        $course = $this->course('etap-1');
        $actor = User::factory()->role('super_admin')->create();
        Lesson::create([
            'course_id' => $course->id,
            'title' => 'Pierwsza lekcja',
            'sequence_order' => 1,
            'duration_seconds' => 600,
            'video_provider_id' => 'mock-pierwsza',
        ]);
        $second = Lesson::create([
            'course_id' => $course->id,
            'title' => 'Druga lekcja',
            'sequence_order' => 2,
            'duration_seconds' => 600,
            'video_provider_id' => 'mock-druga',
        ]);

        $caught = null;

        try {
            LessonWriter::update($second, ['sequence_order' => 1], $actor);
        } catch (ApiException|UniqueConstraintViolationException $e) {
            $caught = $e;
        }

        $this->assertInstanceOf(UniqueConstraintViolationException::class, $caught);
        $this->assertStringContainsString('lessons_course_sequence_unique', $caught->getMessage());
        $this->assertFalse(RecordingIdIndex::isViolatedBy($caught));
        $this->assertSame(2, $second->fresh()->sequence_order);
    }

    public function test_rollback_drops_only_the_index_and_migrate_puts_it_back_without_touching_data(): void
    {
        $course = $this->course('etap-1');
        $this->insertLesson($course, 'mock-a');
        $this->insertLesson($course, 'MOCK-STARE-WIELKIE');
        $this->insertLesson($course, null);
        $this->insertLesson($course, '');
        $this->insertLesson($course, 'mock-b', deleted: true);
        $this->insertLesson($course, 'mock-b');

        $indexesBefore = $this->lessonIndexes();
        $rowsBefore = $this->lessonRows();
        $this->assertArrayHasKey(self::INDEX, $indexesBefore);

        $this->assertSame(0, $this->artisan('migrate:rollback', ['--path' => self::MIGRATION])->run());

        $this->assertSame(array_diff_key($indexesBefore, [self::INDEX => true]), $this->lessonIndexes());
        $this->assertEquals($rowsBefore, $this->lessonRows());

        $this->assertSame(0, $this->artisan('migrate', ['--path' => self::MIGRATION])->run());

        $this->assertSame($indexesBefore, $this->lessonIndexes());
        $this->assertEquals($rowsBefore, $this->lessonRows());
    }

    public function test_migrating_over_a_repeated_id_stops_with_a_count_and_changes_nothing(): void
    {
        $this->assertSame(0, $this->artisan('migrate:rollback', ['--path' => self::MIGRATION])->run());

        $course = $this->course('etap-1');
        // Powtórzone wśród żywych: dwie pary (jedna różni się wielkością liter), cztery lekcje.
        $this->insertLesson($course, 'mock-sekretny-x');
        $this->insertLesson($course, 'MOCK-SEKRETNY-X');
        $this->insertLesson($course, 'mock-sekretny-y');
        $this->insertLesson($course, 'mock-sekretny-y');
        // Niepoliczone: usunięta lekcja z tym samym identyfikatorem, puste wartości.
        $this->insertLesson($course, 'mock-sekretny-x', deleted: true);
        $this->insertLesson($course, '');
        $this->insertLesson($course, '');
        $this->insertLesson($course, null);
        $this->insertLesson($course, null);

        $indexesBefore = $this->lessonIndexes();
        $rowsBefore = $this->lessonRows();
        $this->assertArrayNotHasKey(self::INDEX, $indexesBefore);

        $caught = null;

        try {
            $this->artisan('migrate', ['--path' => self::MIGRATION])->run();
        } catch (RuntimeException $e) {
            $caught = $e;
        }

        $this->assertNotNull($caught, 'Migracja powinna się zatrzymać na powtórzonych identyfikatorach.');
        $this->assertStringContainsString('2 identyfikator(ów)', $caught->getMessage());
        $this->assertStringContainsString('w 4 żywych lekcjach', $caught->getMessage());
        $this->assertStringNotContainsString('sekretny', strtolower($caught->getMessage()));
        $this->assertSame($indexesBefore, $this->lessonIndexes());
        $this->assertEquals($rowsBefore, $this->lessonRows());
    }

    /**
     * Kolejność wdrożenia: migracja przed kodem. Kod sprzed zmiany zapisywał
     * kolumnę wprost, bez normalizacji — te same operacje na modelu przechodzą
     * na schemacie z indeksem; zmienia się jedno: powtórzenie odrzuca baza.
     */
    public function test_the_previous_write_path_still_works_on_the_schema_with_the_index(): void
    {
        $course = $this->course('etap-1');
        $write = fn (?string $recording): Lesson => Lesson::create([
            'course_id' => $course->id,
            'title' => 'Lekcja zapisana wprost',
            'sequence_order' => ++$this->order,
            'duration_seconds' => 600,
            'video_provider_id' => $recording,
        ]);

        $first = $write('AbC-xyz-09');
        $write(null);
        $write('');
        $write(null);

        $first->fill(['video_provider_id' => 'Inne-Nagranie']);
        $first->save();
        $first->update(['title' => 'Zmieniony tytuł']);
        $first->delete();
        $reused = $write('Inne-Nagranie');

        $this->assertSame('Inne-Nagranie', $reused->fresh()->video_provider_id);
        $this->assertSame(4, Lesson::where('course_id', $course->id)->count());
        $this->assertIndexRefuses(fn () => $write('INNE-NAGRANIE'));
        $this->assertSame(4, Lesson::where('course_id', $course->id)->count());
        $this->assertSame(5, Lesson::withTrashed()->where('course_id', $course->id)->count());
    }

    private function assertIndexRefuses(Closure $write): void
    {
        $caught = null;

        try {
            DB::transaction($write);
        } catch (UniqueConstraintViolationException $e) {
            $caught = $e;
        }

        $this->assertNotNull($caught, 'Baza powinna odrzucić zapis.');
        $this->assertTrue(RecordingIdIndex::isViolatedBy($caught));
        $this->assertStringContainsString('"'.self::INDEX.'"', $caught->getMessage());
    }

    /** @return array<string, string> */
    private function lessonIndexes(): array
    {
        return DB::table('pg_indexes')
            ->where('tablename', 'lessons')
            ->orderBy('indexname')
            ->pluck('indexdef', 'indexname')
            ->all();
    }

    /** @return list<array<string, mixed>> */
    private function lessonRows(): array
    {
        return DB::table('lessons')->orderBy('id')->get()->map(fn (object $row): array => (array) $row)->all();
    }

    private function course(string $slug): Course
    {
        return Course::create([
            'title' => 'Kurs '.$slug,
            'slug' => $slug,
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'is_published' => false,
        ]);
    }

    /**
     * Wstawienie wprost do tabeli — poza modelem, jego zdarzeniami i regułami
     * żądania.
     */
    private function insertLesson(Course $course, ?string $recording, bool $deleted = false): int
    {
        return (int) DB::table('lessons')->insertGetId([
            'course_id' => $course->id,
            'title' => 'Lekcja wstawiona wprost',
            'sequence_order' => ++$this->order,
            'duration_seconds' => 600,
            'video_provider_id' => $recording,
            'created_at' => now(),
            'updated_at' => now(),
            'deleted_at' => $deleted ? now() : null,
        ]);
    }
}
