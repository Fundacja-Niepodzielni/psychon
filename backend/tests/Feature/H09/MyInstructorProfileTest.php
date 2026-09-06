<?php

namespace Tests\Feature\H09;

use App\Models\Course;
use App\Models\InstructorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * H09 · własna wizytówka prowadzącego (GET/PATCH /me/instructor-profile) i
 * lista jego kursów (GET /instructor/courses). Za role:instructor.
 */
class MyInstructorProfileTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_instructor_reads_own_card(): void
    {
        Sanctum::actingAs($this->user('joanna@demo.pl'));

        $this->getJson('/api/v1/me/instructor-profile')
            ->assertOk()
            ->assertJsonPath('data.user_id', $this->user('joanna@demo.pl')->id)
            ->assertJsonPath('data.city', 'Warszawa')
            ->assertJsonPath('data.supervisor', null)
            ->assertJsonPath('data.courses.0.slug', 'podstawy-pomocy');
    }

    public function test_non_instructor_role_is_forbidden(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));
        $this->getJson('/api/v1/me/instructor-profile')->assertStatus(403);

        Sanctum::actingAs($this->user('admin@demo.pl'));
        $this->patchJson('/api/v1/me/instructor-profile', ['city' => 'Gdańsk'])->assertStatus(403);
    }

    public function test_instructor_updates_own_card(): void
    {
        Sanctum::actingAs($this->user('joanna@demo.pl'));

        $this->patchJson('/api/v1/me/instructor-profile', [
            'specializations' => ['praca z traumą'],
            'city' => 'Gdańsk',
        ])
            ->assertOk()
            ->assertJsonPath('data.city', 'Gdańsk')
            ->assertJsonPath('data.specializations.0', 'praca z traumą');

        $this->getJson('/api/v1/me/instructor-profile')
            ->assertOk()
            ->assertJsonPath('data.city', 'Gdańsk');
    }

    public function test_first_update_creates_the_profile_row(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $this->assertNull($instructor->instructorProfile);

        Sanctum::actingAs($instructor);

        $this->patchJson('/api/v1/me/instructor-profile', ['bio' => 'Nowa wizytówka.'])
            ->assertOk()
            ->assertJsonPath('data.bio', 'Nowa wizytówka.');

        $this->assertDatabaseHas('instructor_profiles', [
            'user_id' => $instructor->id,
            'bio' => 'Nowa wizytówka.',
        ]);
    }

    public function test_card_without_a_profile_row_reads_as_an_empty_card(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        Sanctum::actingAs($instructor);

        $this->getJson('/api/v1/me/instructor-profile')
            ->assertOk()
            ->assertJsonPath('data.user_id', $instructor->id)
            ->assertJsonPath('data.city', null)
            ->assertJsonPath('data.specializations', [])
            ->assertJsonPath('data.responsibilities', [])
            ->assertJsonPath('data.courses', []);
    }

    public function test_update_ignores_fields_outside_the_card(): void
    {
        $joanna = $this->user('joanna@demo.pl');
        $mentor = User::factory()->role('instructor')->create();
        Sanctum::actingAs($joanna);

        $this->patchJson('/api/v1/me/instructor-profile', [
            'city' => 'Poznań',
            'user_id' => 999,
            'supervisor_id' => $mentor->id,
        ])->assertOk();

        $profile = InstructorProfile::where('user_id', $joanna->id)->firstOrFail();
        $this->assertSame($joanna->id, $profile->user_id);
        $this->assertNull($profile->supervisor_id);
        $this->assertSame('Poznań', $profile->city);
    }

    public function test_instructor_courses_lists_led_courses_sorted(): void
    {
        Sanctum::actingAs($this->user('joanna@demo.pl'));

        $response = $this->getJson('/api/v1/instructor/courses')->assertOk();

        $this->assertSame(
            ['podstawy-pomocy', 'wywiad-psychologiczny', 'interwencja-kryzysowa'],
            array_column($response->json('data'), 'slug'),
        );
        $this->assertSame(
            ['id', 'slug', 'title', 'sequence_order'],
            array_keys($response->json('data.0')),
        );
    }

    public function test_instructor_without_assignments_gets_an_empty_course_list(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        Sanctum::actingAs($instructor);

        $this->getJson('/api/v1/instructor/courses')->assertOk()->assertExactJson(['data' => []]);
    }

    public function test_instructor_courses_reflect_an_unassignment(): void
    {
        $joanna = $this->user('joanna@demo.pl');
        Course::where('slug', 'podstawy-pomocy')->firstOrFail()
            ->assignments()->whereNull('unassigned_at')->update(['unassigned_at' => now()]);

        Sanctum::actingAs($joanna);

        $slugs = array_column($this->getJson('/api/v1/instructor/courses')->assertOk()->json('data'), 'slug');
        $this->assertSame(['wywiad-psychologiczny', 'interwencja-kryzysowa'], $slugs);
    }

    public function test_instructor_courses_forbidden_for_other_roles(): void
    {
        Sanctum::actingAs($this->user('opiekun@demo.pl'));
        $this->getJson('/api/v1/instructor/courses')->assertStatus(403);
    }

    private function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }
}
