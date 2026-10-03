<?php

namespace Tests\Feature\AccessExpiry;

use App\Http\Requests\H04\ExtendAccessRequest;
use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\User;
use App\Services\H18\AccountManagementGuard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsWithRealmToken;
use Tests\TestCase;

/**
 * H04 · zakres przedłużenia dostępu: data zawsze przyszła, z górnym pułapem,
 * konto Super Admina tylko dla Super Admina. Prawdziwe tokeny realmu.
 */
class ExtendAccessRangeTest extends TestCase
{
    use ActsWithRealmToken;
    use RefreshDatabase;

    private Edition $edition;

    protected function setUp(): void
    {
        parent::setUp();
        $this->edition = Edition::factory()->create(['status' => 'active']);
    }

    private function extend(User $actor, User $target, array $body)
    {
        return $this->withTokenOf($actor)->postJson("/api/v1/admin/users/{$target->id}/extend-access", $body + ['reason' => 'Przedłużenie uzgodnione z prowadzącym.']);
    }

    public function test_project_manager_does_not_reach_a_super_admin_account(): void
    {
        $pm = $this->boundAccount('project_manager');
        $sa = $this->boundAccount('super_admin', ['access_expires_at' => null]);

        foreach ([['until' => now()->addMonth()->toDateString()], ['months' => 1], [], ['until' => 'x', 'months' => 99]] as $body) {
            $this->extend($pm, $sa, $body)
                ->assertStatus(403)
                ->assertJsonPath('error.message', AccountManagementGuard::SUPER_ADMIN_ACCOUNTS_MESSAGE);
        }

        $this->assertNull($sa->fresh()->access_expires_at);
        $this->withTokenOf($sa)->getJson('/api/v1/courses')->assertOk();
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'access.extended')->count());

        $volunteer = $this->boundAccount('volunteer');
        $until = now()->addMonths(3)->toDateString();
        $this->extend($sa, $volunteer, ['until' => $until])->assertOk();
        $this->assertSame($until, $volunteer->fresh()->access_expires_at->toDateString());
    }

    public function test_missing_account_gives_the_card_404_whatever_the_body(): void
    {
        $pm = $this->boundAccount('project_manager');
        $missing = (int) User::query()->max('id') + 1000;

        $card = $this->withTokenOf($pm)->getJson("/api/v1/admin/users/{$missing}")->assertStatus(404)->getContent();

        foreach ([['months' => 1], ['until' => '2000-01-01', 'months' => 99], [], ['until' => 'x']] as $body) {
            $response = $this->withTokenOf($pm)->postJson("/api/v1/admin/users/{$missing}/extend-access", $body);
            $response->assertStatus(404);
            $this->assertSame($card, $response->getContent());
        }
    }

    public function test_date_must_lie_in_the_future(): void
    {
        $pm = $this->boundAccount('project_manager');

        foreach (['volunteer', 'student'] as $role) {
            $expires = now()->addYear()->startOfDay();
            $target = $this->boundAccount($role, ['edition_id' => $this->edition->id, 'access_expires_at' => $expires]);

            foreach (['2000-01-01', now()->subDay()->toDateString(), now()->toDateString()] as $until) {
                $this->extend($pm, $target, ['until' => $until])
                    ->assertStatus(422)
                    ->assertJsonPath('error.code', 'validation_failed')
                    ->assertJsonStructure(['error' => ['errors' => ['until']]]);
            }

            $this->assertTrue($target->fresh()->access_expires_at->equalTo($expires));
            $this->withTokenOf($target)->getJson('/api/v1/courses')->assertOk();
        }

        $this->assertSame(0, AuditLogEntry::query()->where('action', 'access.extended')->count());
    }

    public function test_date_has_an_upper_limit(): void
    {
        $pm = $this->boundAccount('project_manager');
        $volunteer = $this->boundAccount('volunteer', ['access_expires_at' => now()->addMonth()]);
        $limit = ExtendAccessRequest::latestAllowedDate();

        $this->extend($pm, $volunteer, ['until' => $limit->copy()->addDay()->toDateString()])
            ->assertStatus(422)
            ->assertJsonStructure(['error' => ['errors' => ['until']]]);

        $this->extend($pm, $volunteer, ['months' => ExtendAccessRequest::MAX_MONTHS_AHEAD + 1])
            ->assertStatus(422)
            ->assertJsonStructure(['error' => ['errors' => ['months']]]);

        $this->extend($pm, $volunteer, ['until' => $limit->toDateString()])->assertOk();
        $this->assertSame($limit->toDateString(), $volunteer->fresh()->access_expires_at->toDateString());
    }

    public function test_months_stacked_on_a_future_date_stay_under_the_limit(): void
    {
        $pm = $this->boundAccount('project_manager');
        $expires = now()->addMonths(20)->startOfDay();
        $volunteer = $this->boundAccount('volunteer', ['access_expires_at' => $expires]);

        $this->extend($pm, $volunteer, ['months' => 6])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['months']]]);
        $this->assertTrue($volunteer->fresh()->access_expires_at->equalTo($expires));

        $this->extend($pm, $volunteer, ['months' => 3])->assertOk();
        $this->assertSame($expires->copy()->addMonths(3)->toDateString(), $volunteer->fresh()->access_expires_at->toDateString());
    }
}
