<?php

namespace Tests\Feature\H11;

use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\InternshipEntry;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class InternshipTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Edition::create([
            'name' => 'Edycja testowa',
            'internship_hours_required' => 72,
            'status' => 'active',
        ]);
    }

    public function test_volunteer_can_create_and_list_only_own_entries_with_progress(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $other = User::factory()->create(['role' => 'volunteer']);
        InternshipEntry::create([
            'user_id' => $volunteer->id,
            'date' => '2026-08-20',
            'hours' => '0.5',
            'form' => 'phone_duty',
            'consultations_count' => 0,
            'description' => 'Wpis zaakceptowany.',
            'status' => 'accepted',
        ]);
        InternshipEntry::create([
            'user_id' => $volunteer->id,
            'date' => '2026-08-21',
            'hours' => '3.0',
            'form' => 'chat_duty',
            'consultations_count' => 2,
            'description' => 'Wpis oczekujący.',
            'status' => 'submitted',
        ]);
        InternshipEntry::create([
            'user_id' => $other->id,
            'date' => '2026-08-22',
            'hours' => '4.0',
            'form' => 'other',
            'consultations_count' => 1,
            'status' => 'submitted',
        ]);

        $response = $this->actingAs($volunteer, 'sanctum')
            ->getJson('/api/v1/internship/entries');

        $response->assertOk()
            ->assertJsonPath('meta.extra.accepted_hours', '0.5')
            ->assertJsonPath('meta.extra.required_hours', '72')
            ->assertJsonCount(2, 'data');

        $keys = array_keys($response->json('data.0'));
        $this->assertSame([
            'id', 'date', 'hours', 'form', 'consultations_count', 'description',
            'status', 'review_comment', 'decided_at', 'created_at', 'updated_at',
        ], $keys);

        $created = $this->actingAs($volunteer, 'sanctum')->postJson('/api/v1/internship/entries', [
            'date' => Carbon::today()->toDateString(),
            'hours' => '0.5',
            'form' => 'other',
            'consultations_count' => 0,
            'description' => 'Nowy wpis.',
            'user_id' => $other->id,
        ]);

        $created->assertCreated()->assertJsonPath('data.status', 'submitted');
        $this->assertDatabaseHas('internship_entries', [
            'id' => $created->json('data.id'),
            'user_id' => $volunteer->id,
            'status' => 'submitted',
        ]);

        Edition::query()->where('status', 'active')->update(['internship_hours_required' => 80]);
        $this->actingAs($volunteer, 'sanctum')
            ->getJson('/api/v1/internship/entries')
            ->assertOk()
            ->assertJsonPath('meta.extra.required_hours', '80');
    }

    public function test_validation_rejects_future_date_invalid_hours_form_and_consultations(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $payload = [
            'date' => Carbon::tomorrow()->toDateString(),
            'hours' => '1.25',
            'form' => 'in_person',
            'consultations_count' => -1,
        ];

        $response = $this->actingAs($volunteer, 'sanctum')
            ->postJson('/api/v1/internship/entries', $payload);

        $response->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['date', 'hours', 'form', 'consultations_count']]]);

        $this->actingAs($volunteer, 'sanctum')
            ->postJson('/api/v1/internship/entries', [
                ...$payload,
                'date' => Carbon::today()->toDateString(),
                'hours' => '25',
                'form' => 'phone_duty',
                'consultations_count' => 0,
            ])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.hours.0', 'Wpis może obejmować maksymalnie 24 godziny.');

        $this->actingAs($volunteer, 'sanctum')
            ->postJson('/api/v1/internship/entries', [
                ...$payload,
                'date' => Carbon::today()->toDateString(),
                'hours' => '0',
                'form' => 'phone_duty',
                'consultations_count' => 0,
            ])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.hours.0', 'Wpis musi obejmować co najmniej 0,5 godziny.');
    }

    public function test_owner_isolation_and_status_locking_are_enforced(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $other = User::factory()->create(['role' => 'volunteer']);
        $submitted = InternshipEntry::create($this->entryData($volunteer, 'submitted'));
        $accepted = InternshipEntry::create($this->entryData($volunteer, 'accepted'));

        $this->actingAs($other, 'sanctum')
            ->patchJson("/api/v1/internship/entries/{$submitted->id}", ['hours' => '2.0'])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->actingAs($volunteer, 'sanctum')
            ->patchJson("/api/v1/internship/entries/{$accepted->id}", ['hours' => '2.0'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'entry_locked');

        $this->assertSame('5.0', (string) $accepted->fresh()->hours);
    }

    public function test_returned_entry_can_be_resubmitted_and_keeps_comment_after_acceptance(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $admin = User::factory()->create(['role' => 'project_manager']);
        $entry = InternshipEntry::create($this->entryData($volunteer, 'submitted'));

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/internship/{$entry->id}/return", ['comment' => 'Doprecyzuj opis.'])
            ->assertOk();

        $this->actingAs($volunteer, 'sanctum')
            ->patchJson("/api/v1/internship/entries/{$entry->id}", ['hours' => '2.0'])
            ->assertOk()
            ->assertJsonPath('data.status', 'submitted')
            ->assertJsonPath('data.review_comment', 'Doprecyzuj opis.');

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/internship/{$entry->id}/accept")
            ->assertOk()
            ->assertJsonPath('data.status', 'accepted')
            ->assertJsonPath('data.review_comment', 'Doprecyzuj opis.')
            ->assertJsonStructure(['data' => ['user' => ['id', 'first_name', 'last_name']]]);
    }

    public function test_admin_queue_is_sorted_and_decisions_are_audited_and_notified(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $old = InternshipEntry::create($this->entryData($volunteer, 'submitted'));
        $old->forceFill(['created_at' => now()->subDay(), 'updated_at' => now()->subDay()])->save();
        $new = InternshipEntry::create($this->entryData($volunteer, 'submitted'));

        $queue = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/internship/pending');

        $queue->assertOk()->assertJsonPath('meta.per_page', 25);
        $this->assertSame([$old->id, $new->id], array_column($queue->json('data'), 'id'));
        $this->assertSame(['id', 'date', 'hours', 'form', 'consultations_count', 'description', 'status', 'review_comment', 'decided_at', 'created_at', 'updated_at', 'user'], array_keys($queue->json('data.0')));

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/internship/{$old->id}/accept")
            ->assertOk();

        $this->assertDatabaseHas('audit_log', [
            'action' => 'internship.accepted',
            'subject_id' => $old->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $volunteer->id,
            'type' => 'internship.accepted',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/internship/{$old->id}/accept")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'entry_locked');

        $this->assertSame(1, AuditLogEntry::where('action', 'internship.accepted')->count());
        $this->assertSame(1, Notification::where('type', 'internship.accepted')->count());
    }

    public function test_return_requires_comment_and_non_admin_cannot_decide(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        $entry = InternshipEntry::create($this->entryData($volunteer, 'submitted'));

        $this->actingAs($volunteer, 'sanctum')
            ->getJson('/api/v1/admin/internship/pending')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $admin = User::factory()->create(['role' => 'project_manager']);
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/internship/{$entry->id}/return", ['comment' => '   '])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame('submitted', $entry->fresh()->status);
    }

    public function test_participant_routes_require_volunteer_role_and_active_access(): void
    {
        $this->getJson('/api/v1/internship/entries')->assertStatus(401);

        $admin = User::factory()->create(['role' => 'project_manager']);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/internship/entries')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');

        $expired = User::factory()->create([
            'role' => 'volunteer',
            'access_expires_at' => now()->subMinute(),
            'program_completed_at' => null,
        ]);

        $this->actingAs($expired, 'sanctum')
            ->getJson('/api/v1/internship/entries')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'access_expired');

    }

    public function test_h11_does_not_register_single_entry_get_route(): void
    {
        $this->assertFalse(collect(app('router')->getRoutes()->getRoutes())
            ->contains(fn ($route): bool => $route->uri() === 'api/v1/internship/entries/{id}' && in_array('GET', $route->methods(), true)));
    }

    private function entryData(User $user, string $status): array
    {
        return [
            'user_id' => $user->id,
            'date' => Carbon::yesterday()->toDateString(),
            'hours' => '5.0',
            'form' => 'phone_duty',
            'consultations_count' => 2,
            'description' => 'Opis testowy bez danych osobowych.',
            'status' => $status,
        ];
    }
}
