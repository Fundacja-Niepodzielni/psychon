<?php

namespace Tests\Feature\H09;

use App\Models\InstructorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * H09 · wizytówki prowadzących (GET /instructors, GET /instructors/{id}).
 * DTO bez danych wrażliwych; trasa za logowaniem, nie publiczna.
 */
class InstructorDirectoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_logged_in_participant_sees_the_directory_with_courses(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));
        $joanna = $this->user('joanna@demo.pl');

        $response = $this->getJson('/api/v1/instructors')->assertOk();

        $response->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('meta.per_page', 25)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $joanna->id)
            ->assertJsonPath('data.0.user_id', $joanna->id)
            ->assertJsonPath('data.0.first_name', 'Joanna')
            ->assertJsonPath('data.0.city', 'Warszawa');

        $this->assertContains('interwencja kryzysowa', $response->json('data.0.specializations'));
        $this->assertSame(
            ['podstawy-pomocy', 'wywiad-psychologiczny', 'interwencja-kryzysowa'],
            array_column($response->json('data.0.courses'), 'slug'),
        );
        $this->assertSame(
            ['id', 'user_id', 'first_name', 'last_name', 'city', 'specializations', 'bio', 'experience', 'responsibilities', 'courses'],
            array_keys($response->json('data.0')),
        );
    }

    public function test_directory_dto_hides_sensitive_fields(): void
    {
        Sanctum::actingAs($this->user('filip@demo.pl'));

        $card = $this->getJson('/api/v1/instructors')->assertOk()->json('data.0');

        $this->assertArrayNotHasKey('email', $card);
        $this->assertArrayNotHasKey('pesel', $card);
        $this->assertArrayNotHasKey('address', $card);
    }

    public function test_directory_requires_authentication(): void
    {
        $this->getJson('/api/v1/instructors')->assertStatus(401);
    }

    public function test_single_card_includes_own_supervisor_when_set(): void
    {
        $joanna = $this->user('joanna@demo.pl');
        $mentor = User::factory()->role('instructor')->create(['first_name' => 'Zofia', 'last_name' => 'Mentor']);
        $joanna->instructorProfile->update(['supervisor_id' => $mentor->id]);

        Sanctum::actingAs($this->user('marta@demo.pl'));

        $this->getJson("/api/v1/instructors/{$joanna->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $joanna->id)
            ->assertJsonPath('data.supervisor.id', $mentor->id)
            ->assertJsonPath('data.supervisor.name', 'Zofia Mentor');
    }

    public function test_single_card_supervisor_is_null_when_unset(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));
        $joanna = $this->user('joanna@demo.pl');

        $this->getJson("/api/v1/instructors/{$joanna->id}")
            ->assertOk()
            ->assertJsonPath('data.supervisor', null);
    }

    public function test_unknown_card_returns_404(): void
    {
        Sanctum::actingAs($this->user('marta@demo.pl'));

        $this->getJson('/api/v1/instructors/999999')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_account_without_a_profile_is_not_a_card(): void
    {
        $bareInstructor = User::factory()->role('instructor')->create();
        Sanctum::actingAs($this->user('marta@demo.pl'));

        $this->getJson("/api/v1/instructors/{$bareInstructor->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        // and a non-instructor with a stray profile row is not listed either
        $this->getJson('/api/v1/instructors')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_non_instructor_account_is_excluded_even_with_a_profile_row(): void
    {
        $volunteer = User::factory()->role('volunteer')->create();
        InstructorProfile::create(['user_id' => $volunteer->id, 'city' => 'Kraków']);

        Sanctum::actingAs($this->user('admin@demo.pl'));

        $ids = array_column($this->getJson('/api/v1/instructors')->assertOk()->json('data'), 'user_id');
        $this->assertNotContains($volunteer->id, $ids);
    }

    private function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }
}
