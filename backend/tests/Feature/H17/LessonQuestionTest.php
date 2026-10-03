<?php

namespace Tests\Feature\H17;

use App\Models\AuditLogEntry;
use App\Models\Course;
use App\Models\InstructorQuestion;
use App\Models\Lesson;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Participant side of H17 on the demo seed: joanna@demo.pl runs courses 1–3 at
 * course level, marta@demo.pl has course 2 unlocked and course 3 locked.
 */
class LessonQuestionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_participant_can_ask_a_question_about_an_unlocked_lesson(): void
    {
        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');

        $response = $this->postJson(
            "/api/v1/lessons/{$this->unlockedLesson()->id}/questions",
            ['question' => 'Jak reagować na milczenie?'],
        )->assertCreated();

        $this->assertSame(
            ['id', 'lesson_id', 'question', 'answer', 'answered_by_name',
                'answered_at', 'created_at', 'updated_at'],
            array_keys($response->json('data')),
        );
        $this->assertSame('Jak reagować na milczenie?', $response->json('data.question'));
        $this->assertNull($response->json('data.answer'));
        $this->assertNull($response->json('data.answered_by_name'));
        $this->assertNull($response->json('data.answered_at'));
    }

    public function test_asking_notifies_the_inherited_instructor_only(): void
    {
        $marta = $this->user('marta@demo.pl');
        $joanna = $this->user('joanna@demo.pl');
        $this->actingAs($marta, 'keycloak');

        $this->postJson(
            "/api/v1/lessons/{$this->unlockedLesson()->id}/questions",
            ['question' => 'Pytanie do prowadzącej.'],
        )->assertCreated();

        $this->assertSame(1, Notification::where('user_id', $joanna->id)
            ->where('type', 'question.asked')->count());
        $this->assertSame(0, Notification::where('user_id', $marta->id)
            ->where('type', 'question.asked')->count());
    }

    public function test_question_without_addressee_goes_to_the_foundation_team_only(): void
    {
        $lesson = $this->unlockedLesson();
        $lesson->course->assignments()->update(['unassigned_at' => now()]);
        $before = Notification::count();
        $lastId = (int) Notification::max('id');
        $team = User::query()->whereIn('role', ['project_manager', 'super_admin'])
            ->where('status', 'active')->orderBy('id')->pluck('id')->all();

        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');
        $this->postJson("/api/v1/lessons/{$lesson->id}/questions", [
            'question' => 'Pytanie bez adresata.',
        ])->assertCreated();

        // E-41: bez prowadzącego pytanie trafia do zespołu Fundacji (każdy
        // aktywny Opiekun Projektu i Super Admin, osobno), bez treści pytania.
        $this->assertNotSame([], $team);
        $this->assertSame($before + count($team), Notification::count());
        $this->assertSame($team, Notification::query()->where('type', 'question.asked')
            ->where('id', '>', $lastId)->orderBy('user_id')->pluck('user_id')->all());
        $this->assertSame(0, Notification::query()->where('type', 'question.asked')
            ->where('body', 'like', '%Pytanie bez adresata.%')->count());
        $this->assertSame(1, InstructorQuestion::where('lesson_id', $lesson->id)
            ->where('question', 'Pytanie bez adresata.')->count());
    }

    public function test_question_about_a_locked_course_is_refused_and_stores_nothing(): void
    {
        $locked = Course::where('slug', 'interwencja-kryzysowa')->firstOrFail();
        $lesson = $locked->lessons()->orderBy('sequence_order')->firstOrFail();
        $before = InstructorQuestion::count();

        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');

        $this->postJson("/api/v1/lessons/{$lesson->id}/questions", [
            'question' => 'Pytanie do zablokowanego kursu.',
        ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked');

        $this->assertSame($before, InstructorQuestion::count());
    }

    public function test_blank_question_is_rejected(): void
    {
        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');

        $this->postJson("/api/v1/lessons/{$this->unlockedLesson()->id}/questions", [
            'question' => '   ',
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['question']]]);
    }

    public function test_missing_lesson_is_not_found(): void
    {
        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');

        $this->postJson('/api/v1/lessons/999999/questions', ['question' => 'Pytanie.'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_instructor_cannot_use_the_participant_route(): void
    {
        $this->actingAs($this->user('joanna@demo.pl'), 'keycloak');

        $this->postJson("/api/v1/lessons/{$this->unlockedLesson()->id}/questions", [
            'question' => 'Pytanie od prowadzącej.',
        ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_participant_sees_only_their_own_questions_at_the_lesson(): void
    {
        $lesson = $this->unlockedLesson();
        $marta = $this->user('marta@demo.pl');
        $other = User::factory()->create([
            'role' => 'volunteer',
            'access_expires_at' => now()->addYear(),
        ]);

        // This row must sort ahead of the seed's own question on this
        // lesson (`DemoSeeder.php:326`, inserted moments earlier in `setUp()`).
        // Relying on plain `now()` here ties the assertion below to real
        // wall-clock ordering between two `now()` calls in the same process —
        // a failing run once measured the seed row ending up with a
        // `created_at` LATER than this row's, which the query's `id` tie-break
        // cannot compensate for (`created_at` differed, so it was never a
        // tie). Anchoring explicitly to the latest existing `created_at` for
        // this lesson removes the race entirely: this row is guaranteed to
        // sort first regardless of any wall-clock behaviour between the
        // seeder and the test body.
        $latestExisting = InstructorQuestion::where('lesson_id', $lesson->id)->max('created_at');
        $mineCreatedAt = $latestExisting !== null
            ? Carbon::parse($latestExisting)->addSecond()
            : Carbon::now();

        $mine = InstructorQuestion::create([
            'user_id' => $marta->id,
            'lesson_id' => $lesson->id,
            'question' => 'Moje pytanie.',
            'answer' => 'Odpowiedź prowadzącej.',
            'answered_by' => $this->user('joanna@demo.pl')->id,
            'answered_at' => now(),
        ]);
        // `created_at` nie jest w $fillable modelu (celowo — bez tego wyjatku
        // nikt spoza tego pliku nie mogby sfalszowac czasu powstania pytania),
        // wiec jawna wartosc wymaga `forceFill()` (omija liste dopuszczonych
        // pol) i DRUGIEGO `save()`. Drugi zapis nie rusza juz `created_at`
        // (Eloquent ustawia je wylacznie przy INSERCIE, `!$this->exists`),
        // wiec tylko `updated_at` idzie na `now()` — bez znaczenia tutaj.
        $mine->forceFill(['created_at' => $mineCreatedAt])->save();
        InstructorQuestion::create([
            'user_id' => $other->id,
            'lesson_id' => $lesson->id,
            'question' => 'Cudze pytanie.',
        ]);

        $this->actingAs($marta, 'keycloak');
        $response = $this->getJson("/api/v1/lessons/{$lesson->id}/questions")->assertOk();

        // The demo seed already gives marta one question on this very lesson,
        // so the assertion is „mine and only mine", not „exactly one".
        $returned = array_column($response->json('data'), 'id');
        $this->assertContains($mine->id, $returned);
        $this->assertSame(
            InstructorQuestion::where('lesson_id', $lesson->id)
                ->where('user_id', $marta->id)
                ->count(),
            $response->json('meta.total'),
        );
        $this->assertSame(
            [],
            array_diff($returned, InstructorQuestion::where('user_id', $marta->id)->pluck('id')->all()),
        );

        // Newest first, so the question created here leads.
        $this->assertSame($mine->id, $returned[0]);
        $this->assertSame('Odpowiedź prowadzącej.', $response->json('data.0.answer'));
        $this->assertSame('Joanna Demo', $response->json('data.0.answered_by_name'));
        $this->assertNotNull($response->json('data.0.answered_at'));
    }

    /**
     * Deterministic positive control for the mechanism actually measured
     * behind a once-failing run of the test above: the seed's own question
     * on this lesson (`DemoSeeder.php:326`) ended up with a `created_at`
     * strictly LATER than the participant row created moments afterwards in
     * the test body. That is not a tie — the `id` tie-break at
     * `LessonQuestionController.php:38-39` only ever activates on genuinely
     * equal timestamps — so no tie-break change could have fixed it. This
     * test reproduces the exact same precondition explicitly (a row whose
     * `created_at` is 1 second BEFORE the seed row's, simulating whatever
     * made the seed row's clock read later) and asserts the query's actual,
     * correct behaviour under it: the row with the later `created_at`
     * legitimately sorts first. The fragility was never in this ordering
     * rule; it was in the OTHER test's assumption that its own row would
     * always be newer than the seed's, which that test no longer assumes
     * (its `created_at` is now anchored explicitly to `max(created_at)` for
     * the lesson, see the comment there).
     */
    public function test_a_strictly_earlier_created_at_correctly_loses_the_ordering_race(): void
    {
        $lesson = $this->unlockedLesson();
        $marta = $this->user('marta@demo.pl');

        $seedQuestion = InstructorQuestion::where('lesson_id', $lesson->id)
            ->where('user_id', $marta->id)
            ->firstOrFail();

        $earlier = InstructorQuestion::create([
            'user_id' => $marta->id,
            'lesson_id' => $lesson->id,
            'question' => 'Symulacja kroku zegara wstecz wzgledem pytania seeda.',
        ]);
        // Patrz komentarz przy `forceFill` powyzej: `created_at` nie jest
        // fillable, wiec jawna wartosc trzeba nadac po utworzeniu wiersza.
        $earlier->forceFill(['created_at' => $seedQuestion->created_at->clone()->subSecond()])->save();

        $this->actingAs($marta, 'keycloak');
        $response = $this->getJson("/api/v1/lessons/{$lesson->id}/questions")->assertOk();

        $ids = array_column($response->json('data'), 'id');
        $this->assertContains($earlier->id, $ids);
        $this->assertSame(
            $seedQuestion->id,
            $ids[0],
            'Ze scisle wczesniejszym created_at wiersz testu poprawnie przegrywa wyscig o kolejnosc — to mechanizm zmierzony w prawdziwym czerwonym biegu, nie usterka zapytania.',
        );
    }

    /**
     * The route's query orders `created_at` DESC with an explicit
     * `id` DESC tie-break (`LessonQuestionController.php:38-39`). Two
     * questions created in the same frozen instant must still resolve
     * deterministically — the row created later (the higher `id`) wins the
     * tie, matching "newest first". Without the tie-break, ties are decided
     * by whatever order Postgres happens to return equal keys in, which is
     * not guaranteed to be insertion order.
     */
    public function test_tie_in_created_at_is_broken_by_id_descending(): void
    {
        $lesson = $this->unlockedLesson();
        $marta = $this->user('marta@demo.pl');

        $this->travelTo(Carbon::now());

        $older = InstructorQuestion::create([
            'user_id' => $marta->id,
            'lesson_id' => $lesson->id,
            'question' => 'Pytanie A, ten sam znacznik czasu.',
        ]);
        $newer = InstructorQuestion::create([
            'user_id' => $marta->id,
            'lesson_id' => $lesson->id,
            'question' => 'Pytanie B, ten sam znacznik czasu.',
        ]);

        // Sanity check on the fixture itself: this test only proves anything
        // if both rows genuinely share one instant.
        $this->assertSame(
            $older->created_at->format('Y-m-d H:i:s.u'),
            $newer->created_at->format('Y-m-d H:i:s.u'),
            'Ten test ma sens tylko, gdy oba wpisy dzieli dokladnie ta sama chwila.',
        );
        $this->assertGreaterThan($older->id, $newer->id);

        $this->actingAs($marta, 'keycloak');
        $response = $this->getJson("/api/v1/lessons/{$lesson->id}/questions")->assertOk();

        $ids = array_column($response->json('data'), 'id');
        $this->assertSame(
            $newer->id,
            $ids[0],
            'Przy remisie czasu wygrywa wyzszy id (najnowsze pierwsze, malejaco).',
        );

        $this->travelBack();
    }

    /**
     * When timestamps genuinely differ, `created_at` —
     * not `id` — still decides the order. Constructed adversarially: the
     * row that is later in TIME is created FIRST (so it gets the smaller
     * id), by travelling forward then back before the second insert. If the
     * order followed `id` instead of `created_at`, this assertion would
     * fail.
     */
    public function test_order_by_time_is_unaffected_by_id_when_timestamps_differ(): void
    {
        $lesson = $this->unlockedLesson();
        $marta = $this->user('marta@demo.pl');

        $this->travelTo(Carbon::now()->addMinute());
        $laterInTime = InstructorQuestion::create([
            'user_id' => $marta->id,
            'lesson_id' => $lesson->id,
            'question' => 'Nowszy czasowo, ale utworzony pierwszy (nizszy id).',
        ]);

        $this->travelTo(Carbon::now()->subMinutes(2));
        $earlierInTime = InstructorQuestion::create([
            'user_id' => $marta->id,
            'lesson_id' => $lesson->id,
            'question' => 'Starszy czasowo, ale utworzony drugi (wyzszy id).',
        ]);

        $this->assertGreaterThan(
            $laterInTime->id,
            $earlierInTime->id,
            'Ten test ma sens tylko, gdy id i czas sa rozbiezne.',
        );
        $this->assertTrue($laterInTime->created_at->gt($earlierInTime->created_at));

        $this->actingAs($marta, 'keycloak');
        $response = $this->getJson("/api/v1/lessons/{$lesson->id}/questions")->assertOk();

        $ids = array_column($response->json('data'), 'id');
        $this->assertSame(
            $laterInTime->id,
            $ids[0],
            'Rozne znaczniki czasu: kolejnosc idzie za czasem, nie za id.',
        );

        $this->travelBack();
    }

    public function test_listing_questions_of_a_locked_course_is_refused(): void
    {
        $locked = Course::where('slug', 'interwencja-kryzysowa')->firstOrFail();
        $lesson = $locked->lessons()->orderBy('sequence_order')->firstOrFail();

        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');

        $this->getJson("/api/v1/lessons/{$lesson->id}/questions")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked');
    }

    public function test_package_writes_no_audit_entries(): void
    {
        $before = AuditLogEntry::count();

        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');
        $this->postJson("/api/v1/lessons/{$this->unlockedLesson()->id}/questions", [
            'question' => 'Pytanie bez audytu.',
        ])->assertCreated();

        $this->assertSame($before, AuditLogEntry::count());
    }

    private function unlockedLesson(): Lesson
    {
        return Course::where('slug', 'wywiad-psychologiczny')
            ->firstOrFail()
            ->lessons()
            ->orderBy('sequence_order')
            ->firstOrFail();
    }

    private function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }
}
