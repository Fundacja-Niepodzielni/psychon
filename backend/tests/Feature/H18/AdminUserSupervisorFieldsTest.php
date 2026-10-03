<?php

namespace Tests\Feature\H18;

use App\Http\Resources\AdminUserListResource;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\ActsWithRealmToken;
use Tests\TestCase;

/**
 * Pola tylko do odczytu na liście osób (`GET /admin/users`) i na karcie
 * osoby (`GET /admin/users/{id}`): bieżący prowadzący `{id, name}` albo
 * `null`, a na karcie także data założenia konta obok jego stanu. Lista
 * wczytuje prowadzących dla całej strony naraz — liczba zapytań nie rośnie
 * z liczbą wierszy. Plik CSV listy zostaje bez zmian.
 */
class AdminUserSupervisorFieldsTest extends TestCase
{
    use ActsWithRealmToken;
    use RefreshDatabase;

    public function test_list_shows_the_current_supervisor_or_null(): void
    {
        $admin = $this->boundAccount('project_manager');
        $previous = User::factory()->role('instructor')->create(['first_name' => 'Ewa', 'last_name' => 'Demo']);
        $current = User::factory()->role('instructor')->create(['first_name' => 'Joanna', 'last_name' => 'Demo']);
        $assigned = User::factory()->role('volunteer')->create(['first_name' => 'Marta', 'last_name' => 'Demo']);
        $alone = User::factory()->role('volunteer')->create(['first_name' => 'Ola', 'last_name' => 'Demo']);

        $this->assign($admin, $assigned, $previous);
        $this->assign($admin, $assigned, $current);

        $rows = collect(
            $this->withTokenOf($admin)
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
            array_keys($rows[$alone->id]),
        );
    }

    public function test_list_needs_the_same_number_of_queries_for_one_and_for_fifty_rows(): void
    {
        $admin = $this->boundAccount('project_manager');
        $this->volunteersWithSupervisor(1);

        // Pierwsze żądanie z tokenem może przygotować stan logowania — poza pomiarem.
        $this->withTokenOf($admin)->getJson('/api/v1/admin/users?role=volunteer')->assertOk();

        $forOne = $this->queriesForVolunteerList($admin, 1);

        $this->volunteersWithSupervisor(49);
        $forFifty = $this->queriesForVolunteerList($admin, 50);

        $this->assertSame($forOne, $forFifty);
    }

    public function test_card_shows_the_current_supervisor_and_the_account_state(): void
    {
        $admin = $this->boundAccount('super_admin');
        $supervisor = User::factory()->role('instructor')->create(['first_name' => 'Joanna', 'last_name' => 'Demo']);
        $person = User::factory()->role('volunteer')->create([
            'first_name' => 'Marta',
            'last_name' => 'Demo',
            'status' => 'blocked',
        ]);
        $person->forceFill(['created_at' => Carbon::parse('2026-09-20T10:00:00Z')])->save();

        $card = $this->withTokenOf($admin)
            ->getJson("/api/v1/admin/users/{$person->id}")
            ->assertOk()
            ->json('data');

        $this->assertArrayHasKey('supervisor', $card);
        $this->assertNull($card['supervisor']);
        $this->assertSame(['status' => 'blocked', 'created_at' => '2026-09-20T10:00:00Z', 'blocked_reason' => null], $card['account']);

        // Przypisanie sprzed zablokowania konta: zablokowanej osobie nie nadaje się
        // już prowadzącego, a karta nadal pokazuje tego, który był przypisany.
        SupervisorAssignment::query()->create([
            'volunteer_id' => $person->id,
            'supervisor_id' => $supervisor->id,
            'assigned_at' => now()->subWeek(),
        ]);

        $this->withTokenOf($admin)
            ->getJson("/api/v1/admin/users/{$person->id}")
            ->assertOk()
            ->assertJsonPath('data.supervisor', ['id' => $supervisor->id, 'name' => 'Joanna Demo']);
    }

    public function test_csv_export_keeps_its_header_without_the_supervisor(): void
    {
        $admin = $this->boundAccount('project_manager');
        $supervisor = User::factory()->role('instructor')->create();
        $person = User::factory()->role('volunteer')->create();
        $this->assign($admin, $person, $supervisor);

        $body = $this->withTokenOf($admin)
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
        $this->withTokenOf($admin)
            ->putJson("/api/v1/admin/users/{$person->id}/supervisor", ['supervisor_id' => $supervisor->id])
            ->assertOk();
    }

    /**
     * Każda osoba ma własnego prowadzącego i jedno wcześniejsze, zamknięte
     * przypisanie — tak jak po zmianie prowadzącego.
     */
    private function volunteersWithSupervisor(int $count): void
    {
        foreach (range(1, $count) as $ignored) {
            $person = User::factory()->role('volunteer')->create();
            $earlier = User::factory()->role('instructor')->create();
            $current = User::factory()->role('instructor')->create();

            SupervisorAssignment::query()->create([
                'volunteer_id' => $person->id,
                'supervisor_id' => $earlier->id,
                'assigned_at' => now()->subMonth(),
                'unassigned_at' => now()->subWeek(),
            ]);
            SupervisorAssignment::query()->create([
                'volunteer_id' => $person->id,
                'supervisor_id' => $current->id,
                'assigned_at' => now()->subWeek(),
            ]);
        }
    }

    private function queriesForVolunteerList(User $admin, int $expectedRows): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();

        $rows = $this->withTokenOf($admin)
            ->getJson('/api/v1/admin/users?role=volunteer&per_page=100')
            ->assertOk()
            ->assertJsonCount($expectedRows, 'data')
            ->json('data');

        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();

        foreach ($rows as $row) {
            $this->assertNotNull($row['supervisor']);
        }

        return $queries;
    }
}
