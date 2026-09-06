<?php

namespace Tests\Feature\H01;

use App\Models\Consent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pakiet H01 · Profil użytkownika — kryteria 1 i 2.
 */
class ProfileTest extends TestCase
{
    use RefreshDatabase;

    /** A fictional but checksum-valid PESEL (1990-01-01). */
    private const string VALID_PESEL = '90010112349';

    private const string INVALID_PESEL = '90010112345';

    public function test_get_me_returns_the_full_profile_with_the_owners_pesel(): void
    {
        $user = User::factory()->create([
            'pesel' => self::VALID_PESEL,
            'phone' => '+48 600 100 200',
            'address_street' => 'ul. Przykładowa 1/2',
            'address_city' => 'Warszawa',
            'address_zip' => '00-001',
        ]);
        Consent::create([
            'user_id' => $user->id,
            'type' => 'regulamin',
            'document_version' => 'v1',
            'granted_at' => now()->subMonths(4),
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/me')
            ->assertOk()
            ->assertJsonPath('data.pesel', self::VALID_PESEL)
            ->assertJsonPath('data.address.city', 'Warszawa')
            ->assertJsonPath('data.consents.0.type', 'regulamin')
            ->assertJsonPath('data.consents.0.status', 'granted')
            ->assertJsonStructure([
                'data' => [
                    'id', 'first_name', 'last_name', 'email', 'role', 'phone', 'pesel',
                    'address' => ['street', 'city', 'zip'],
                    'access_expires_at', 'program_completed_at', 'product_group', 'consents',
                ],
            ]);
    }

    public function test_invalid_pesel_is_rejected_with_a_field_error(): void
    {
        $user = User::factory()->create(['pesel' => null]);
        Sanctum::actingAs($user);

        $this->patchJson('/api/v1/me', ['pesel' => self::INVALID_PESEL])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.pesel.0', 'Nieprawidłowy numer PESEL.');

        $this->assertNull($user->fresh()->pesel);
    }

    public function test_valid_pesel_is_saved_and_visible_in_get_me(): void
    {
        $user = User::factory()->create(['pesel' => null]);
        Sanctum::actingAs($user);

        $this->patchJson('/api/v1/me', ['pesel' => self::VALID_PESEL])
            ->assertOk()
            ->assertJsonPath('data.pesel', self::VALID_PESEL);

        $this->assertSame(self::VALID_PESEL, $user->fresh()->pesel);
    }

    public function test_patch_me_never_changes_the_email(): void
    {
        $user = User::factory()->create(['email' => 'owner@demo.pl']);
        Sanctum::actingAs($user);

        $this->patchJson('/api/v1/me', [
            'email' => 'attacker@evil.pl',
            'first_name' => 'Zmieniono',
        ])->assertOk();

        $fresh = $user->fresh();
        $this->assertSame('owner@demo.pl', $fresh->email);
        $this->assertSame('Zmieniono', $fresh->first_name);
    }

    public function test_patch_me_updates_the_nested_address(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->patchJson('/api/v1/me', [
            'address' => ['street' => 'ul. Nowa 5', 'city' => 'Gdańsk', 'zip' => '80-001'],
        ])->assertOk()->assertJsonPath('data.address.city', 'Gdańsk');

        $this->assertSame('ul. Nowa 5', $user->fresh()->address_street);
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/v1/me')->assertStatus(401);
    }
}
