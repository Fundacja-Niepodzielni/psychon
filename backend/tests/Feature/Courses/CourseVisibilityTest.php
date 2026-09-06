<?php

namespace Tests\Feature\Courses;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Course visibility per the role matrix (docs/system/03-role-i-uprawnienia.md §2,
 * row „Kursy: przeglądanie i nauka"). Assertions compare the identity of the
 * returned slugs, not their count — a broken join returning duplicates would
 * still produce a plausible count.
 */
class CourseVisibilityTest extends TestCase
{
    use RefreshDatabase;

    /** The 10 path stages of the canonical seed, in sequence order. */
    private const array PATH_SLUGS = [
        'podstawy-pomocy',
        'wywiad-psychologiczny',
        'interwencja-kryzysowa',
        'praca-z-emocjami',
        'komunikacja-wspierajaca',
        'kryzys-suicydalny',
        'wsparcie-mlodziezy',
        'granice-i-etyka',
        'higiena-pracy-pomagacza',
        'superwizja-i-rozwoj',
    ];

    private const string WEBINAR_SLUG = 'webinar-pierwsza-rozmowa';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_student_sees_only_courses_outside_the_sequence(): void
    {
        Sanctum::actingAs($this->user('filip@demo.pl'));

        $this->assertSame([self::WEBINAR_SLUG], $this->catalogueSlugs());
    }

    public function test_volunteer_sees_the_path_and_no_invited_course(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));

        $this->assertSame(self::PATH_SLUGS, $this->catalogueSlugs());
    }

    public function test_instructor_sees_only_assigned_courses(): void
    {
        Sanctum::actingAs($this->user('joanna@demo.pl'));

        $this->assertSame(array_slice(self::PATH_SLUGS, 0, 3), $this->catalogueSlugs());
    }

    public function test_instructor_stops_seeing_a_course_after_being_unassigned(): void
    {
        $joanna = $this->user('joanna@demo.pl');
        $course3 = Course::where('slug', 'interwencja-kryzysowa')->firstOrFail();

        CourseAssignment::where('course_id', $course3->id)
            ->where('instructor_id', $joanna->id)
            ->update(['unassigned_at' => now()]);

        Sanctum::actingAs($joanna);

        $this->assertSame(array_slice(self::PATH_SLUGS, 0, 2), $this->catalogueSlugs());
    }

    public function test_administration_sees_every_published_course_without_locks(): void
    {
        Sanctum::actingAs($this->user('admin@demo.pl'));

        $items = collect($this->getJson('/api/v1/courses')->assertOk()->json('data'));

        $this->assertSame([...self::PATH_SLUGS, self::WEBINAR_SLUG], $items->pluck('slug')->all());
        $this->assertSame([], $items->where('status', 'locked')->pluck('slug')->all());
    }

    public function test_unpublished_courses_are_hidden(): void
    {
        Course::where('slug', 'praca-z-emocjami')->update(['is_published' => false]);

        Sanctum::actingAs($this->user('admin@demo.pl'));

        $this->assertNotContains('praca-z-emocjami', $this->catalogueSlugs());
    }

    public function test_course_outside_the_callers_scope_answers_404_not_403(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));

        $this->getJson('/api/v1/courses/'.self::WEBINAR_SLUG)
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    /**
     * @return list<string>
     */
    private function catalogueSlugs(): array
    {
        return collect($this->getJson('/api/v1/courses')->assertOk()->json('data'))
            ->pluck('slug')
            ->all();
    }

    private function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }
}
