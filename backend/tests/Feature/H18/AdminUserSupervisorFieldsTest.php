<?php

namespace Tests\Feature\H18;

use App\Http\Resources\AdminUserListResource;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Pola tylko do odczytu na liście osób (`GET /admin/users`) i na karcie
 * osoby (`GET /admin/users/{id}`): bieżący prowadzący `{id, name}` albo
 * `null`, a na karcie także stan i data założenia konta. Plik CSV listy
 * zostaje bez zmian — jego nagłówek to wyłącznie `FIELDS`.
 */
class AdminUserSupervisorFieldsTest extends TestCase
{
    use RefreshDatabase;

    public function test_list_shows_the_current_supervisor_or_null(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $previous = User::factory()->role('instructor')->create(['first_name' => 'Ewa', 'last_name' => 'Demo']);
        $current = User::factory()->role('instructor')->create(['first_name' => 'Joanna', 'last_name' => 'Demo']);
        $assigned = User::factory()->create(['role' => 'volunteer', 'first_name' => 'Marta', 'last_name' => 'Demo']);
        $alone = User::factory()->create(['role' => 'volunteer', 'first_name' => 'Ola', 'last_name' => 'Demo']);

        $this->assign($admin, $assigned, $previous);
        $this->assign($admin, $assigned, $current);

        $rows = collect(
            $this->actingAs($admin, 'keycloak')
                ->getJson('/api/v1/admin/users?per_page=100')
                ->assertOk()
                ->json('data'),
        )->keyBy('id');

        $this->assertSame(['id' => $current->id, 'name' => 'Joanna Demo'], $rows[$assigned->id]['supervisor']);
        $this->assertNull($rows[$alone->id]['supervisor']);
        $this->assertNull($rows[$current->id]['supervisor']);
        // Klucz jest zawsze obecny, także z wartością `null`.
        $this->assertSame(
            [...AdminUserListResource::FIELDS, ...AdminUserListResource::READ_ONLY_FIELDS],
            array_keys($rows[$assigned->id]),
        );
    }

    public function test_card_shows_the_current_supervisor_and_the_account_state(): void
    {
        $admin = User::factory()->role('super_admin')->create();
        $supervisor = User::factory()->role('instructor')->create(['first_name' => 'Joanna', 'last_name' => 'Demo']);
        $person = User::factory()->create([
            'role' => 'volunteer',
            'first_name' => 'Marta',
            'last_name' => 'Demo',
            'status' => 'blocked',
        ]);
        $person->forceFill(['created_at' => Carbon::parse('2026-09-20T10:00:00Z')])->save();

        $card = $this->actingAs($admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}")
            ->assertOk()
            ->json('data');

        $this->assertArrayHasKey('supervisor', $card);
        $this->assertNull($card['supervisor']);
        $this->assertSame(['status' => 'blocked', 'created_at' => '2026-09-20T10:00:00Z'], $card['account']);

        $this->assign($admin, $person, $supervisor);

        $this->actingAs($admin, 'keycloak')
            ->getJson("/api/v1/admin/users/{$person->id}")
            ->assertOk()
            ->assertJsonPath('data.supervisor', ['id' => $supervisor->id, 'name' => 'Joanna Demo']);
    }

    public function test_csv_export_keeps_its_header_without_the_supervisor(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->create(['role' => 'volunteer']);
        $this->assign($admin, $person, $supervisor);

        $body = $this->actingAs($admin, 'keycloak')
            ->get('/api/v1/admin/users/export.csv?role=volunteer')
            ->assertOk()
            ->streamedContent();

        $lines = array_values(array_filter(explode("\n", str_replace("\r", '', substr($body, 3)))));
        $this->assertSame(implode(';', AdminUserListResource::FIELDS), $lines[0]);
        $this->assertCount(2, $lines);
        $this->assertCount(count(AdminUserListResource::FIELDS), explode(';', $lines[1]));
    }

    private function assign(User $admin, User $person, User $supervisor): void
    {
        $this->actingAs($admin, 'keycloak')
            ->putJson("/api/v1/admin/users/{$person->id}/supervisor", ['supervisor_id' => $supervisor->id])
            ->assertOk();
    }
}
