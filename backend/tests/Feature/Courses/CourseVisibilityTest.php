<?php

namespace Tests\Feature\Courses;

use App\Models\Course;
use App\Models\CourseAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\Sso\KeycloakTokenFactory;
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
        $this->actingAs($this->user('filip@demo.pl'), 'keycloak');

        $this->assertSame([self::WEBINAR_SLUG], $this->catalogueSlugs());
    }

    public function test_volunteer_sees_the_path_and_no_invited_course(): void
    {
        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');

        $this->assertSame(self::PATH_SLUGS, $this->catalogueSlugs());
    }

    /**
     * R2 (sprint-2 §1) disagreement guarantee, for THIS query specifically:
     * a local `users.role` of `student` would only ever see the webinar
     * (see the test above). A real bearer token carrying the realm role
     * mapped to `volunteer` must still see the whole path — proof that
     * `CourseCatalogQuery` decides from the token's roles, never the
     * `users` row, even when the two disagree.
     */
    public function test_the_token_role_wins_over_a_conflicting_local_role(): void
    {
        $realm = (new KeycloakTokenFactory)->installAsRealm();
        $sub = (string) Str::uuid();
        User::factory()->role('student')->create(['keycloak_sub' => $sub]);
        $token = $realm->mint(['sub' => $sub, 'realm_access' => ['roles' => ['wolontariusz']]]);

        $slugs = collect(
            $this->withHeader('Authorization', 'Bearer '.$token)
                ->getJson('/api/v1/courses')
                ->assertOk()
                ->json('data'),
        )->pluck('slug')->all();

        $this->assertSame(self::PATH_SLUGS, $slugs);
    }

    public function test_instructor_sees_only_assigned_courses(): void
    {
        $this->actingAs($this->user('joanna@demo.pl'), 'keycloak');

        $this->assertSame(array_slice(self::PATH_SLUGS, 0, 3), $this->catalogueSlugs());
    }

    public function test_instructor_stops_seeing_a_course_after_being_unassigned(): void
    {
        $joanna = $this->user('joanna@demo.pl');
        $course3 = Course::where('slug', 'interwencja-kryzysowa')->firstOrFail();

        CourseAssignment::where('course_id', $course3->id)
            ->where('instructor_id', $joanna->id)
            ->update(['unassigned_at' => now()]);

        $this->actingAs($joanna, 'keycloak');

        $this->assertSame(array_slice(self::PATH_SLUGS, 0, 2), $this->catalogueSlugs());
    }

    public function test_administration_sees_every_published_course_without_locks(): void
    {
        $this->actingAs($this->user('admin@demo.pl'), 'keycloak');

        $items = collect($this->getJson('/api/v1/courses')->assertOk()->json('data'));

        $this->assertSame([...self::PATH_SLUGS, self::WEBINAR_SLUG], $items->pluck('slug')->all());
        $this->assertSame([], $items->where('status', 'locked')->pluck('slug')->all());
    }

    public function test_unpublished_courses_are_hidden(): void
    {
        Course::where('slug', 'praca-z-emocjami')->update(['is_published' => false]);

        $this->actingAs($this->user('admin@demo.pl'), 'keycloak');

        $this->assertNotContains('praca-z-emocjami', $this->catalogueSlugs());
    }

    public function test_course_outside_the_callers_scope_answers_404_not_403(): void
    {
        $this->actingAs($this->user('marta@demo.pl'), 'keycloak');

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
