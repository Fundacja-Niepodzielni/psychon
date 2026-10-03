<?php

namespace Tests\Feature\Emails;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\EmailMessage;
use App\Models\Lesson;
use App\Models\Notification;
use App\Models\User;
use App\Services\H08\InstructorCourseAssignment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\H10\TestPackageCase;

/**
 * Odbiorcy według treści e-maili: sprawy zespołu (E-17, E-39, E-41) dostaje
 * osobno każdy aktywny Opiekun Projektu i każdy aktywny Super Admin; konta
 * nieaktywne nie dostają nic. E-08 nie wychodzi, gdy prowadzący sam zakłada
 * kurs.
 */
class TeamAndInstructorRecipientsTest extends TestPackageCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.frontend_url' => EmailTemplatesTest::BASE_URL]);
    }

    /**
     * @return array{active: list<int>, inactive: list<int>, other: list<int>}
     */
    private function team(): array
    {
        return [
            'active' => [
                User::factory()->role('project_manager')->create()->id,
                User::factory()->role('super_admin')->create()->id,
            ],
            'inactive' => [
                User::factory()->role('project_manager')->create(['status' => 'blocked'])->id,
                User::factory()->role('super_admin')->create(['status' => 'blocked'])->id,
            ],
            'other' => [User::factory()->role('instructor')->create()->id],
        ];
    }

    /**
     * @param  array{active: list<int>, inactive: list<int>, other: list<int>}  $team
     */
    private function assertTeamGot(array $team, string $type, string $subject): void
    {
        $recipients = Notification::query()->where('type', $type)->orderBy('user_id')->pluck('user_id')->all();
        sort($team['active']);

        $this->assertSame($team['active'], $recipients);

        foreach ($team['active'] as $id) {
            $this->assertSame(
                [$subject],
                EmailMessage::query()->where('to_user_id', $id)->pluck('subject')->all(),
            );
        }

        foreach ([...$team['inactive'], ...$team['other']] as $id) {
            $this->assertSame(0, Notification::query()->where('user_id', $id)->count());
            $this->assertSame(0, EmailMessage::query()->where('to_user_id', $id)->count());
        }
    }

    public function test_e_17_goes_to_every_active_project_manager_and_super_admin_separately(): void
    {
        $team = $this->team();
        $test = $this->makeTest(questions: 10);
        $this->actingAs($this->volunteer(), 'keycloak');

        for ($i = 1; $i <= 3; $i++) {
            $this->postJson("/api/v1/tests/{$test->id}/attempts", [
                'answers' => $this->answersForAttempt($test, 2, $i),
            ])->assertCreated();
        }

        $this->assertTeamGot($team, 'attempt.failed_final', 'PsychON: wyczerpane podejścia do testu');
        $this->assertStringContainsString(
            '„'.$test->course->title.'”',
            (string) EmailMessage::query()->where('to_user_id', $team['active'][0])->value('body_html'),
        );
    }

    public function test_e_17_is_not_sent_while_attempts_remain(): void
    {
        $team = $this->team();
        $test = $this->makeTest(questions: 10);
        $this->actingAs($this->volunteer(), 'keycloak');

        for ($i = 1; $i <= 2; $i++) {
            $this->postJson("/api/v1/tests/{$test->id}/attempts", [
                'answers' => $this->answersForAttempt($test, 2, $i),
            ])->assertCreated();
        }

        $this->assertSame(0, Notification::query()->where('type', 'attempt.failed_final')->count());
        $this->assertSame(0, EmailMessage::query()->whereIn('to_user_id', $team['active'])->count());
    }

    public function test_e_39_new_cooperation_request_goes_to_the_team(): void
    {
        $team = $this->team();
        $graduate = User::factory()->role('volunteer')->create(['program_completed_at' => now()->subDay()]);

        $this->actingAs($graduate, 'keycloak')
            ->postJson('/api/v1/cooperation-requests', ['body' => 'Chcę dalej prowadzić dyżury telefoniczne.'])
            ->assertCreated();

        $this->assertTeamGot($team, 'cooperation_request.created', 'PsychON: nowe zgłoszenie dalszej współpracy');
        $this->assertSame(0, Notification::query()->where('user_id', $graduate->id)->count());

        $row = EmailMessage::query()->where('to_user_id', $team['active'][0])->sole();
        $this->assertStringNotContainsString('dyżury telefoniczne', $row->body_html);
        $this->assertStringContainsString(EmailTemplatesTest::BASE_URL.'/admin/zgloszenia-wspolpracy', $row->body_html);
    }

    public function test_e_39_refused_request_notifies_nobody(): void
    {
        $team = $this->team();
        $participant = User::factory()->role('volunteer')->create(['program_completed_at' => null]);

        $this->actingAs($participant, 'keycloak')
            ->postJson('/api/v1/cooperation-requests', ['body' => 'Za wcześnie.'])
            ->assertStatus(403);

        $this->assertSame(0, Notification::query()->count());
        $this->assertSame(0, EmailMessage::query()->whereIn('to_user_id', $team['active'])->count());
    }

    /**
     * Kurs poza ścieżką (zawsze otwarty), opublikowany, z jedną lekcją.
     */
    private function lesson(string $title): Lesson
    {
        $course = Course::create([
            'title' => 'Kurs '.$title,
            'slug' => 'kurs-'.uniqid(),
            'type' => 'course',
            'product_group' => 'psychon',
            'sequence_order' => null,
            'edition_id' => $this->activeEdition()->id,
            'is_published' => true,
        ]);

        return Lesson::create([
            'course_id' => $course->id,
            'title' => $title,
            'sequence_order' => 1,
            'duration_seconds' => 0,
            'content' => 'Treść lekcji.',
        ]);
    }

    public function test_e_41_question_to_a_lesson_without_instructor_goes_to_the_team(): void
    {
        $team = $this->team();
        $lesson = $this->lesson('Kryzys a zaburzenie');

        $this->actingAs($this->volunteer(), 'keycloak')
            ->postJson("/api/v1/lessons/{$lesson->id}/questions", ['question' => 'Pytanie bez adresata.'])
            ->assertCreated();

        $this->assertTeamGot($team, 'question.asked', 'PsychON: pytanie do lekcji bez prowadzącego');

        $row = EmailMessage::query()->where('to_user_id', $team['active'][0])->sole();
        $this->assertStringContainsString('„Kryzys a zaburzenie” w kursie „Kurs Kryzys a zaburzenie”', $row->body_html);
        $this->assertStringNotContainsString('Pytanie bez adresata.', $row->body_html);
    }

    public function test_e_41_is_not_sent_when_the_lesson_has_an_instructor(): void
    {
        $team = $this->team();
        $lesson = $this->lesson('Kryzys a zaburzenie');
        $instructor = User::factory()->role('instructor')->create();
        CourseAssignment::create([
            'course_id' => $lesson->course_id,
            'lesson_id' => null,
            'instructor_id' => $instructor->id,
            'assigned_by' => $team['active'][0],
            'assigned_at' => now(),
        ]);

        $this->actingAs($this->volunteer(), 'keycloak')
            ->postJson("/api/v1/lessons/{$lesson->id}/questions", ['question' => 'Pytanie do prowadzącej.'])
            ->assertCreated();

        $this->assertSame([$instructor->id], Notification::query()->where('type', 'question.asked')->pluck('user_id')->all());
        $this->assertSame(['PsychON: nowe pytanie do lekcji'], EmailMessage::query()->pluck('subject')->all());
        $this->assertSame(0, EmailMessage::query()->whereIn('to_user_id', $team['active'])->count());
    }

    public function test_e_08_goes_when_administration_assigns_the_instructor(): void
    {
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');
        $instructor = User::factory()->role('instructor')->create();
        $course = $this->lesson('Pierwsza lekcja')->course;

        $this->postJson("/api/v1/admin/courses/{$course->id}/assignments", ['instructor_id' => $instructor->id])
            ->assertCreated();

        $this->assertSame(1, Notification::query()->where('user_id', $instructor->id)->where('type', 'assignment.created')->count());
        $this->assertSame(
            ['PsychON: nowy kurs do prowadzenia'],
            EmailMessage::query()->where('to_user_id', $instructor->id)->pluck('subject')->all(),
        );
    }

    public function test_e_08_does_not_go_when_the_instructor_creates_the_course_themselves(): void
    {
        $edition = $this->activeEdition();
        $instructor = User::factory()->role('instructor')->create();
        $course = Course::create([
            'title' => 'Własny kurs prowadzącego',
            'slug' => 'wlasny-kurs-prowadzacego',
            'type' => 'course',
            'product_group' => 'psychon',
            'edition_id' => $edition->id,
            'is_published' => false,
        ]);

        InstructorCourseAssignment::assignCreator($course, $instructor);

        $this->assertSame(1, Notification::query()->where('user_id', $instructor->id)->where('type', 'assignment.created')->count());
        $this->assertSame(0, EmailMessage::query()->where('to_user_id', $instructor->id)->count());
    }
}
