<?php

namespace Tests\Feature\H08;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\Lesson;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Treść lekcji (`lessons.content`, podzbiór Markdown bez HTML) — aneks
 * kontraktu „Treść lekcji (H06, H08)".
 *
 * Oczekiwane wartości pochodzą z aneksu: limit 20 000 ZNAKÓW (nie bajtów),
 * przekroczenie → 422 `validation_failed` na polu `content`; treść zapisana
 * dokładnie tak, jak przyszła (HTML jest tekstem); pole na odczycie lekcji
 * i w zasobie administracji/prowadzącego, nigdy na liście lekcji uczestnika;
 * ładunek audytu bez treści.
 *
 * Stan bazowy: `DemoSeeder` — marta ma odblokowany kurs 2
 * (`wywiad-psychologiczny`).
 */
class LessonContentTest extends TestCase
{
    use RefreshDatabase;

    private const string COURSE_SLUG = 'wywiad-psychologiczny';

    /** Trzy wektory z noga XSS: skrypt, obraz z obsługą błędu, link `javascript:`. */
    private const string XSS = "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))";

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_content_of_exactly_20000_multibyte_characters_is_accepted_on_every_write_route(): void
    {
        $content = str_repeat('ż', 20000);
        $this->assertSame(40000, strlen($content), 'Treść ma 40 000 bajtów — limit liczy znaki.');

        $course = $this->course();
        $lesson = $this->lesson();
        $instructor = $this->assignedInstructor($course);

        $this->actingAs($this->admin(), 'keycloak');
        $created = $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", [
            'title' => 'Lekcja z treścią (administracja)',
            'content' => $content,
        ])->assertCreated()->assertJsonPath('data.content', $content);
        $this->assertSame($content, Lesson::findOrFail($created->json('data.id'))->content);

        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['content' => $content])
            ->assertOk()
            ->assertJsonPath('data.content', $content);
        $this->assertSame($content, $lesson->fresh()->content);

        $this->actingAs($instructor, 'keycloak');
        $created = $this->postJson("/api/v1/instructor/courses/{$course->id}/lessons", [
            'title' => 'Lekcja z treścią (prowadzący)',
            'content' => $content,
        ])->assertCreated()->assertJsonPath('data.content', $content);
        $this->assertSame($content, Lesson::findOrFail($created->json('data.id'))->content);

        $lesson->forceFill(['content' => null])->save();
        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['content' => $content])
            ->assertOk()
            ->assertJsonPath('data.content', $content);
        $this->assertSame($content, $lesson->fresh()->content);
    }

    public function test_content_of_20001_characters_is_rejected_on_every_write_route_and_nothing_is_saved(): void
    {
        $tooLong = str_repeat('ż', 20001);

        $course = $this->course();
        $lesson = $this->lesson();
        $lesson->forceFill(['content' => 'Treść przed próbą.'])->save();
        $before = DB::table('lessons')->where('id', $lesson->id)->first();
        $lessonCount = Lesson::withTrashed()->count();
        $instructor = $this->assignedInstructor($course);

        $requests = [
            [$this->admin(), 'postJson', "/api/v1/admin/courses/{$course->id}/lessons"],
            [null, 'patchJson', "/api/v1/admin/lessons/{$lesson->id}"],
            [$instructor, 'postJson', "/api/v1/instructor/courses/{$course->id}/lessons"],
            [null, 'patchJson', "/api/v1/instructor/lessons/{$lesson->id}"],
        ];

        foreach ($requests as [$actor, $method, $uri]) {
            if ($actor !== null) {
                $this->actingAs($actor, 'keycloak');
            }

            $this->{$method}($uri, ['title' => 'Lekcja za długa', 'content' => $tooLong])
                ->assertStatus(422)
                ->assertJsonPath('error.code', 'validation_failed')
                ->assertJsonPath('error.errors.content.0', 'Treść lekcji może mieć najwyżej 20 000 znaków.');
        }

        $this->assertSame($lessonCount, Lesson::withTrashed()->count(), 'Żadna lekcja nie powstała.');
        $this->assertEquals($before, DB::table('lessons')->where('id', $lesson->id)->first(), 'Wiersz lekcji bez zmian.');
    }

    public function test_html_in_content_is_returned_byte_for_byte_as_text_on_every_read(): void
    {
        $course = $this->course();
        $lesson = $this->lesson();
        $instructor = $this->assignedInstructor($course);

        $this->actingAs($this->admin(), 'keycloak');
        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['content' => self::XSS])->assertOk();

        $this->assertSame(self::XSS, DB::table('lessons')->where('id', $lesson->id)->value('content'));

        $this->actingAs($this->marta(), 'keycloak');
        $participant = $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk();
        $this->assertStringStartsWith('application/json', (string) $participant->headers->get('Content-Type'));
        $this->assertSame(self::XSS, json_decode($participant->getContent(), true)['data']['content']);
        $this->assertStringNotContainsString('&lt;', $participant->getContent(), 'Bez podwójnego escapowania.');

        $this->actingAs($this->admin(), 'keycloak');
        $adminList = $this->getJson("/api/v1/admin/courses/{$course->id}/lessons")->assertOk();
        $this->assertStringStartsWith('application/json', (string) $adminList->headers->get('Content-Type'));
        $this->assertSame(self::XSS, $this->contentOf($adminList->json('data'), $lesson->id));

        $this->actingAs($instructor, 'keycloak');
        $instructorList = $this->getJson("/api/v1/instructor/courses/{$course->id}/lessons")->assertOk();
        $this->assertSame(self::XSS, $this->contentOf($instructorList->json('data'), $lesson->id));

        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['content' => self::XSS.' '])->assertOk();
        $this->assertSame(self::XSS.' ', $lesson->fresh()->content, 'Treść nie jest przycinana.');
    }

    public function test_participant_course_detail_lessons_do_not_carry_content(): void
    {
        $course = $this->course();
        $marker = 'znacznik-tresci-listy-'.str_repeat('q', 12);
        Lesson::query()->where('course_id', $course->id)->update(['content' => $marker]);

        $this->actingAs($this->marta(), 'keycloak');
        $response = $this->getJson('/api/v1/courses/'.self::COURSE_SLUG)->assertOk();

        $lessons = $response->json('data.lessons');
        $this->assertNotEmpty($lessons);
        foreach ($lessons as $item) {
            $this->assertArrayNotHasKey('content', $item);
        }
        $this->assertStringNotContainsString($marker, $response->getContent());
    }

    public function test_audit_payload_of_lesson_writes_never_carries_the_content(): void
    {
        $course = $this->course();
        $lesson = $this->lesson();
        $instructor = $this->assignedInstructor($course);
        $marker = 'unikalny-ciag-tresci-'.bin2hex(random_bytes(6));

        $this->actingAs($this->admin(), 'keycloak');
        $this->patchJson("/api/v1/admin/lessons/{$lesson->id}", ['content' => $marker.'-a'])->assertOk();
        $this->postJson("/api/v1/admin/courses/{$course->id}/lessons", ['title' => 'Nowa', 'content' => $marker.'-b'])->assertCreated();

        $this->actingAs($instructor, 'keycloak');
        $this->patchJson("/api/v1/instructor/lessons/{$lesson->id}", ['content' => $marker.'-c'])->assertOk();

        $rows = DB::table('audit_log')
            ->where('action', 'course.updated')
            ->where('subject_id', $course->id)
            ->orderBy('id')
            ->get();

        $this->assertCount(3, $rows);
        $this->assertSame(
            ['lesson.updated', 'lesson.created', 'lesson.updated'],
            $rows->map(fn ($row): string => json_decode((string) $row->details, true)['op'])->all(),
        );
        foreach ($rows as $row) {
            $this->assertStringNotContainsString($marker, (string) $row->details);
        }
        $this->assertSame(0, DB::table('audit_log')->whereRaw('details::text like ?', ['%'.$marker.'%'])->count());
    }

    public function test_lesson_read_carries_null_content_for_a_lesson_without_content(): void
    {
        $lesson = $this->lesson();
        $this->assertNull($lesson->content);

        $this->actingAs($this->marta(), 'keycloak');
        $data = $this->getJson("/api/v1/lessons/{$lesson->id}")->assertOk()->json('data');

        $this->assertArrayHasKey('content', $data);
        $this->assertNull($data['content']);
    }

    /**
     * @param  list<array<string, mixed>>  $items
     */
    private function contentOf(array $items, int $lessonId): mixed
    {
        foreach ($items as $item) {
            if ($item['id'] === $lessonId) {
                $this->assertArrayHasKey('content', $item);

                return $item['content'];
            }
        }

        $this->fail('Lekcji nie ma na liście.');
    }

    private function course(): Course
    {
        return Course::where('slug', self::COURSE_SLUG)->firstOrFail();
    }

    /** Lekcja odblokowanego kursu marty. */
    private function lesson(): Lesson
    {
        return $this->course()->lessons()->orderBy('sequence_order')->skip(2)->firstOrFail();
    }

    private function marta(): User
    {
        return User::where('email', 'marta@demo.pl')->firstOrFail();
    }

    private function admin(): User
    {
        return User::factory()->role('super_admin')->create();
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
