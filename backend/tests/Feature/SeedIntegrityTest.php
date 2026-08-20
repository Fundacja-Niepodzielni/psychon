<?php

namespace Tests\Feature;

use App\Models\Application;
use App\Models\Certificate;
use App\Models\Course;
use App\Models\InstructorQuestion;
use App\Models\InternshipEntry;
use App\Models\PsychologistProfile;
use App\Models\SupervisionSlot;
use App\Models\TestQuestion;
use App\Models\User;
use App\Support\CourseAccess;
use App\Support\ProgressAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Guards the canonical demo state — every number here comes from
 * docs/hackathon/04-seed-demo.md (the binding source for acceptance criteria).
 */
class SeedIntegrityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_marta_internship_matches_the_canonical_numbers(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $accepted = $marta->internshipEntries()->where('status', 'accepted');

        $this->assertSame(9, $accepted->count(), '41,5 h musi pochodzić z 9 wpisów accepted.');
        $this->assertSame(41.5, (float) $accepted->sum('hours'));
        $this->assertSame(37, (int) $accepted->sum('consultations_count'));

        $this->assertSame(1, $marta->internshipEntries()->where('status', 'submitted')->count());

        $returned = $marta->internshipEntries()->where('status', 'returned')->get();
        $this->assertCount(1, $returned);
        $this->assertNotEmpty($returned->first()->review_comment);
    }

    public function test_marta_course_states_follow_the_seed(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $course1 = Course::where('sequence_order', 1)->firstOrFail();
        $course2 = Course::where('sequence_order', 2)->firstOrFail();
        $course3 = Course::where('sequence_order', 3)->firstOrFail();
        $course10 = Course::where('sequence_order', 10)->firstOrFail();

        $this->assertSame('completed', CourseAccess::state($marta, $course1)['status']);
        $this->assertSame('in_progress', CourseAccess::state($marta, $course2)['status']);
        $this->assertSame('locked', CourseAccess::state($marta, $course3)['status']);
        $this->assertSame('locked', CourseAccess::state($marta, $course10)['status']);

        $this->assertSame(100, CourseAccess::progressPercent($marta, $course1));
        $this->assertSame(40, CourseAccess::progressPercent($marta, $course2)); // 2/5 lessons

        // Test attempts: course 1 passed at 90% (1/3), course 2 failed at 70%.
        $test1Attempts = $marta->testAttempts()->where('test_id', $course1->test->id)->get();
        $this->assertCount(1, $test1Attempts);
        $this->assertSame(90, $test1Attempts->first()->score_percent);
        $this->assertTrue($test1Attempts->first()->passed);

        $test2Attempts = $marta->testAttempts()->where('test_id', $course2->test->id)->get();
        $this->assertCount(1, $test2Attempts);
        $this->assertSame(70, $test2Attempts->first()->score_percent);
        $this->assertFalse($test2Attempts->first()->passed);
        $this->assertNotEmpty($test2Attempts->first()->questions_snapshot);
    }

    public function test_marta_aggregated_progress_matches_the_seed(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $progress = ProgressAggregator::for($marta);

        $this->assertSame(1, $progress['courses_done']);
        $this->assertSame(10, $progress['courses_total']);
        $this->assertSame('41.5', $progress['hours_accepted']);
        $this->assertSame(5, $progress['supervision_present']); // 5 of the required 6
        $this->assertFalse($progress['workshop_done']);
        $this->assertEqualsWithDelta(85, $progress['reliability_percent'], 1); // ≈85%, above the 60% threshold

        // 3 notifications, 1 unread (internship.returned).
        $this->assertSame(3, $marta->notifications()->count());
        $unread = $marta->notifications()->whereNull('read_at')->get();
        $this->assertCount(1, $unread);
        $this->assertSame('internship.returned', $unread->first()->type);

        // 1 generated volunteer agreement.
        $this->assertSame(1, $marta->documents()->where('type', 'volunteer_agreement')->count());
    }

    public function test_ola_is_a_graduate_with_the_full_set(): void
    {
        $ola = User::where('email', 'ola@demo.pl')->firstOrFail();

        $this->assertNotNull($ola->program_completed_at);

        $progress = ProgressAggregator::for($ola);
        $this->assertSame(10, $progress['courses_done']);
        $this->assertSame('72', $progress['hours_accepted']);
        $this->assertSame(6, $progress['supervision_present']);
        $this->assertTrue($progress['workshop_done']);

        $certificate = Certificate::where('user_id', $ola->id)->firstOrFail();
        $this->assertSame('NP/2026/001', $certificate->number);
        $this->assertNull($certificate->revoked_at);

        $this->assertSame('draft', $ola->psychologistProfile->status);
    }

    public function test_filip_is_a_clicked_through_student(): void
    {
        $filip = User::where('email', 'filip@demo.pl')->firstOrFail();

        $this->assertSame('student', $filip->role);
        $this->assertSame(5, $filip->lessonProgress()->where('is_completed', true)->count());
        $this->assertEqualsWithDelta(15, ProgressAggregator::reliabilityPercent($filip), 1);

        // The invited course outside the sequence exists (webinar, psychon).
        $webinar = Course::whereNull('sequence_order')->where('type', 'webinar')->first();
        $this->assertNotNull($webinar);
        $this->assertSame('psychon', $webinar->product_group);
    }

    public function test_joanna_supervision_slots_and_question_queue(): void
    {
        $joanna = User::where('email', 'joanna@demo.pl')->firstOrFail();

        $upcoming = SupervisionSlot::where('supervisor_id', $joanna->id)
            ->where('starts_at', '>', now())
            ->get();

        $this->assertCount(2, $upcoming);
        $this->assertSame(
            [0, 2],
            $upcoming->map(fn (SupervisionSlot $slot): int => $slot->signups()->count())->sort()->values()->all(),
            'Jeden nadchodzący termin zapełniony 2/3, drugi pusty.',
        );

        $this->assertSame(1, InstructorQuestion::whereNull('answer')->count());
    }

    public function test_dashboard_and_report_counters_match_the_seed(): void
    {
        // Participants (volunteer + student, active) = 3.
        $this->assertSame(3, User::whereIn('role', ['volunteer', 'student'])->where('status', 'active')->count());

        // Programme completions = 1, certificates = 1.
        $this->assertSame(1, User::whereNotNull('program_completed_at')->count());
        $this->assertSame(1, Certificate::count());

        // Queues: 1 new application · 2 internship entries awaiting
        // acceptance · 0 profiles awaiting decision · 1 unanswered question.
        $this->assertSame(1, Application::where('status', 'new')->count());
        $this->assertSame(2, InternshipEntry::where('status', 'submitted')->count());
        $this->assertSame(0, PsychologistProfile::where('status', 'submitted')->count());
        $this->assertSame(1, InstructorQuestion::whereNull('answer')->count());

        // Report: 41,5 + 72 = 113,5 accepted hours · 37 + 64 = 101 consultations.
        $accepted = InternshipEntry::where('status', 'accepted');
        $this->assertSame(113.5, (float) $accepted->sum('hours'));
        $this->assertSame(101, (int) $accepted->sum('consultations_count'));
    }

    public function test_course_catalogue_and_question_bank_shape(): void
    {
        // 10 published path courses: 1-3 with 5 lessons, 4-10 with 2.
        $pathCourses = Course::whereNotNull('sequence_order')->where('is_published', true)->get();
        $this->assertCount(10, $pathCourses);

        foreach ($pathCourses as $course) {
            $expected = $course->sequence_order <= 3 ? 5 : 2;
            $this->assertSame($expected, $course->lessons()->count(), "Kurs {$course->sequence_order}: zła liczba lekcji.");
        }

        // Question bank: 10 questions with 4 answers (1 correct) for courses 1-3.
        foreach ([1, 2, 3] as $order) {
            $course = $pathCourses->firstWhere('sequence_order', $order);
            $this->assertNotNull($course->test);
            $this->assertSame(10, $course->test->questions()->count());

            /** @var TestQuestion $question */
            foreach ($course->test->questions as $question) {
                $this->assertSame(4, $question->answers()->count());
                $this->assertSame(1, $question->answers()->where('is_correct', true)->count());
            }
        }

        // Courses 1-3 have a downloadable material.
        foreach ([1, 2, 3] as $order) {
            $course = $pathCourses->firstWhere('sequence_order', $order);
            $this->assertGreaterThanOrEqual(1, $course->materials()->count());
        }
    }
}
