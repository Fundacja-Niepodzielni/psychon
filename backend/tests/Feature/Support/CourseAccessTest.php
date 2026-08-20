<?php

namespace Tests\Feature\Support;

use App\Models\Course;
use App\Models\User;
use App\Support\CourseAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Unit tests of the ONLY sequential-unlock implementation
 * (CourseAccess::state — frozen signature).
 */
class CourseAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_completed_when_all_lessons_done_and_test_passed(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $course1 = Course::where('sequence_order', 1)->firstOrFail();

        $state = CourseAccess::state($marta, $course1);

        $this->assertSame('completed', $state['status']);
        $this->assertSame([], $state['missing']);
    }

    public function test_in_progress_when_previous_stage_is_complete(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $course2 = Course::where('sequence_order', 2)->firstOrFail();

        $state = CourseAccess::state($marta, $course2);

        $this->assertSame('in_progress', $state['status']);
        $this->assertEqualsCanonicalizing(['lessons', 'test'], $state['missing']);
    }

    public function test_locked_when_previous_stage_is_incomplete(): void
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $course2 = Course::where('sequence_order', 2)->firstOrFail();
        $course3 = Course::where('sequence_order', 3)->firstOrFail();

        $state = CourseAccess::state($marta, $course3);

        $this->assertSame('locked', $state['status']);
        $this->assertEqualsCanonicalizing(['lessons', 'test'], $state['missing']);
        $this->assertSame($course2->id, $state['required_course_id']);
    }

    public function test_locked_by_the_test_alone_when_lessons_are_done(): void
    {
        // Filip finished all lessons of course 1 but has not passed its test.
        $filip = User::where('email', 'filip@demo.pl')->firstOrFail();
        $course2 = Course::where('sequence_order', 2)->firstOrFail();

        $state = CourseAccess::state($filip, $course2);

        $this->assertSame('locked', $state['status']);
        $this->assertSame(['test'], $state['missing']);
    }

    public function test_null_sequence_course_is_never_locked(): void
    {
        // Invited course outside the sequence — available in the starter.
        $filip = User::where('email', 'filip@demo.pl')->firstOrFail();
        $webinar = Course::whereNull('sequence_order')->firstOrFail();

        $state = CourseAccess::state($filip, $webinar);

        $this->assertSame('in_progress', $state['status']);
    }

    public function test_last_stage_is_completed_for_a_graduate(): void
    {
        $ola = User::where('email', 'ola@demo.pl')->firstOrFail();
        $course10 = Course::where('sequence_order', 10)->firstOrFail();

        // Courses 4-10 have no tests — completing lessons completes the stage.
        $this->assertSame('completed', CourseAccess::state($ola, $course10)['status']);
    }
}
