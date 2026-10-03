<?php

namespace Tests\Feature\H18;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Trzy żądania zapisujące dane osoby — `POST /admin/users`,
 * `PATCH /admin/users/{id}` i `PATCH /me` — walidują kod pocztowy tym samym
 * wzorem 00-000, a puste imię albo nazwisko daje zdanie przy polu
 * („Wpisz imię.” / „Wpisz nazwisko.”) zamiast ogólnego „To pole musi być
 * tekstem.”. Odmowa 422 niczego nie zapisuje.
 */
class PersonFormValidationTest extends TestCase
{
    use RefreshDatabase;

    private const ZIP_MESSAGE = 'Wpisz kod pocztowy w formacie 00-000.';

    private int $sent = 0;

    /**
     * @return array<string, array{0: string}>
     */
    public static function routes(): array
    {
        return [
            'POST /admin/users' => ['create'],
            'PATCH /admin/users/{id}' => ['update'],
            'PATCH /me' => ['me'],
        ];
    }

    private function send(string $route, array $fields)
    {
        $this->sent++;
        $admin = User::factory()->role('super_admin')->create();
        $target = User::factory()->role('volunteer')->create([
            'first_name' => 'Marta',
            'last_name' => 'Wzorcowa',
            'address_zip' => '80-001',
        ]);

        return match ($route) {
            'create' => $this->actingAs($admin, 'keycloak')->postJson('/api/v1/admin/users', array_merge([
                'first_name' => 'Nowa',
                'last_name' => 'Osoba',
                'email' => 'nowa.osoba.formularz'.$this->sent.'@example.test',
                'role' => 'volunteer',
            ], $fields)),
            'update' => $this->actingAs($admin, 'keycloak')->patchJson('/api/v1/admin/users/'.$target->id, $fields),
            default => $this->actingAs($target, 'keycloak')->patchJson('/api/v1/me', $fields),
        };
    }

    #[DataProvider('routes')]
    public function test_zip_outside_the_postal_pattern_is_rejected_at_the_field(string $route): void
    {
        foreach (['123', '12345', '1-2345', 'ab-cde', '12-3456', '12 345'] as $zip) {
            $this->send($route, ['address' => ['zip' => $zip]])
                ->assertStatus(422)
                ->assertJsonPath('error.code', 'validation_failed')
                ->assertJsonPath('error.errors', ['address.zip' => [self::ZIP_MESSAGE]]);
        }

        $this->assertDatabaseMissing('users', ['address_zip' => '123']);
    }

    #[DataProvider('routes')]
    public function test_zip_in_the_postal_pattern_or_empty_is_accepted(string $route): void
    {
        $expected = $route === 'create' ? 201 : 200;

        $this->send($route, ['address' => ['zip' => '00-000']])->assertStatus($expected);
        $this->send($route, ['address' => ['zip' => '80-001']])->assertStatus($expected);
        $this->send($route, ['address' => ['zip' => null]])->assertStatus($expected);
    }

    #[DataProvider('routes')]
    public function test_empty_first_name_says_what_to_type(string $route): void
    {
        foreach (['', '   ', null] as $empty) {
            $this->send($route, ['first_name' => $empty])
                ->assertStatus(422)
                ->assertJsonPath('error.code', 'validation_failed')
                ->assertJsonPath('error.errors', ['first_name' => ['Wpisz imię.']]);
        }
    }

    #[DataProvider('routes')]
    public function test_empty_last_name_says_what_to_type(string $route): void
    {
        foreach (['', '   ', null] as $empty) {
            $this->send($route, ['last_name' => $empty])
                ->assertStatus(422)
                ->assertJsonPath('error.code', 'validation_failed')
                ->assertJsonPath('error.errors', ['last_name' => ['Wpisz nazwisko.']]);
        }
    }

    public function test_rejected_update_leaves_the_name_unchanged(): void
    {
        $admin = User::factory()->role('super_admin')->create();
        $target = User::factory()->role('volunteer')->create(['first_name' => 'Marta']);

        $this->actingAs($admin, 'keycloak')
            ->patchJson('/api/v1/admin/users/'.$target->id, ['first_name' => ''])
            ->assertStatus(422);

        $this->assertSame('Marta', $target->fresh()->first_name);
    }
}
