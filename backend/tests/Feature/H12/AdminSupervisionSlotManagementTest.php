<?php

namespace Tests\Feature\H12;

use App\Models\AuditLogEntry;
use App\Models\Notification;
use App\Models\SupervisionSignup;
use App\Models\SupervisionSlot;
use App\Models\SupervisorAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AdminSupervisionSlotManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_admin_updates_date_duration_place_and_limit_of_an_upcoming_slot(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->addDays(2));
        $newStart = Carbon::now()->addDays(5)->setTime(17, 30)->utc();

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", [
                'starts_at' => $newStart->toIso8601ZuluString(),
                'duration_minutes' => 60,
                'location_or_link' => 'Sala C',
                'seats_limit' => 5,
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $slot->id)
            ->assertJsonPath('data.starts_at', $newStart->toIso8601ZuluString())
            ->assertJsonPath('data.duration_minutes', 60)
            ->assertJsonPath('data.location_or_link', 'Sala C')
            ->assertJsonPath('data.seats_limit', 5)
            ->assertJsonPath('data.supervisor.id', $slot->supervisor_id);

        $this->assertSame(5, $slot->fresh()->seats_limit);
    }

    public function test_update_is_refused_for_a_slot_that_already_started(): void
    {
        $admin = User::factory()->role('super_admin')->create();
        $slot = $this->slot(Carbon::now()->subHour());

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", ['seats_limit' => 9])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame(3, $slot->fresh()->seats_limit);
    }

    public function test_update_uses_the_same_rules_as_slot_creation(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->addDays(2));

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", [
                'starts_at' => Carbon::now()->subDay()->toIso8601ZuluString(),
            ])
            ->assertStatus(422)
            ->assertJsonPath('error.message', 'Termin musi rozpoczynać się w przyszłości.')
            ->assertJsonStructure(['error' => ['errors' => ['starts_at']]]);

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", ['seats_limit' => 0])
            ->assertStatus(422)
            ->assertJsonPath('error.errors.seats_limit.0', 'Termin musi mieć co najmniej jedno miejsce.');
    }

    public function test_limit_cannot_drop_below_active_signups(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->addDays(2));
        $this->signup($slot);
        $this->signup($slot);

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", ['seats_limit' => 1])
            ->assertStatus(422)
            ->assertJsonStructure(['error' => ['errors' => ['seats_limit']]]);

        $this->assertSame(3, $slot->fresh()->seats_limit);
    }

    public function test_cancel_notifies_signed_up_people_releases_signups_and_records_audit(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-02T15:00:00Z'));

        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->addDays(2));
        $first = $this->signup($slot);
        $second = $this->signup($slot);
        $gone = $this->signup($slot);
        $gone->forceFill(['cancelled_at' => now()->subMinute()])->save();

        $response = $this->actingAs($admin, 'keycloak')
            ->deleteJson("/api/v1/admin/supervision/slots/{$slot->id}")
            ->assertOk()
            ->assertExactJson(['data' => [
                'id' => $slot->id,
                'signups_released' => 2,
                'cancelled_at' => '2026-10-02T15:00:00Z',
            ]]);

        Carbon::setTestNow();

        // Wiersz terminu zostaje ze stanem odwołania; zapisy — wszystkie trzy,
        // także wcześniej wycofany — zostają jako wiersze, zwolnione.
        $fresh = $slot->fresh();
        $this->assertNotNull($fresh);
        $this->assertSame('2026-10-02T15:00:00Z', $fresh->cancelled_at?->toIso8601ZuluString());
        $this->assertSame($admin->id, $fresh->cancelled_by);
        $this->assertSame(3, SupervisionSignup::query()->where('slot_id', $slot->id)->count());
        $this->assertSame(0, SupervisionSignup::query()->where('slot_id', $slot->id)->whereNull('cancelled_at')->count());
        $this->assertNotNull($first->fresh()->cancelled_at);
        $this->assertNotNull($second->fresh()->cancelled_at);

        $notified = Notification::query()
            ->where('type', 'supervision.slot_cancelled')
            ->where('user_id', '!=', $slot->supervisor_id)
            ->orderBy('user_id')
            ->pluck('user_id')
            ->all();
        $this->assertSame([$first->user_id, $second->user_id], $notified);

        $audit = AuditLogEntry::query()->where('action', 'supervision.slot_cancelled')->sole();
        $this->assertSame($admin->id, $audit->actor_id);
        $this->assertSame($slot->id, $audit->details['slot_id']);
        $this->assertSame(2, $audit->details['signups_released']);
        // Wpis audytu wskazuje wiersz, który nadal istnieje.
        $this->assertSame($slot->id, (int) $audit->subject_id);
        $this->assertNotNull(SupervisionSlot::query()->find($audit->subject_id));
        $this->assertNotNull($response->json('data.cancelled_at'));
    }

    public function test_cancelled_slot_stays_on_the_admin_list_with_status_cancelled(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $cancelled = $this->slot(Carbon::now()->addDays(2));
        $scheduled = $this->slot(Carbon::now()->addDays(3));
        $this->signup($cancelled);

        $this->actingAs($admin, 'keycloak')
            ->deleteJson("/api/v1/admin/supervision/slots/{$cancelled->id}")
            ->assertOk();

        $list = $this->actingAs($admin, 'keycloak')
            ->getJson('/api/v1/admin/supervision/slots')
            ->assertOk()
            ->json('data');

        $byId = collect($list)->keyBy('id');
        $this->assertCount(2, $byId);
        $this->assertSame('cancelled', $byId[$cancelled->id]['status']);
        $this->assertNotNull($byId[$cancelled->id]['cancelled_at']);
        $this->assertSame(0, $byId[$cancelled->id]['active_signups_count']);
        $this->assertFalse($byId[$cancelled->id]['can_mark_attendance']);
        $this->assertSame('scheduled', $byId[$scheduled->id]['status']);
        $this->assertNull($byId[$scheduled->id]['cancelled_at']);
    }

    public function test_supervisor_is_notified_about_cancellation(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-02T12:00:00Z'));
        $admin = User::factory()->role('super_admin')->create();
        $slot = $this->slot(Carbon::parse('2026-11-20T10:00:00Z'));
        $this->signup($slot);
        $this->signup($slot);

        $this->actingAs($admin, 'keycloak')
            ->deleteJson("/api/v1/admin/supervision/slots/{$slot->id}")
            ->assertOk();

        $notification = Notification::query()
            ->where('user_id', $slot->supervisor_id)
            ->sole();
        $this->assertSame('supervision.slot_cancelled', $notification->type);
        $this->assertSame('Termin superwizji odwołany', $notification->title);
        $this->assertSame(
            'Administracja odwołała Twój termin superwizji 20.11.2026, 10:00. Zapisane osoby: 2.',
            $notification->body,
        );
        $this->assertSame('/prowadzacy/grupa', $notification->link);
    }

    public function test_supervisor_is_notified_also_when_nobody_was_signed_up(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-02T12:00:00Z'));
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::parse('2026-11-20T10:00:00Z'));

        $this->actingAs($admin, 'keycloak')
            ->deleteJson("/api/v1/admin/supervision/slots/{$slot->id}")
            ->assertOk()
            ->assertJsonPath('data.signups_released', 0);

        $this->assertSame(1, Notification::query()->count());
        $this->assertStringEndsWith('Zapisane osoby: 0.', Notification::query()->sole()->body);
    }

    public function test_reminder_command_skips_cancelled_slots(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 08:00:00', config('app.timezone')));

        $cancelled = $this->slot(Carbon::parse('2026-10-06 18:00:00', config('app.timezone')));
        $kept = $this->signup($cancelled);
        $cancelled->forceFill(['cancelled_at' => now(), 'cancelled_by' => null])->save();
        // Zapis celowo zostawiony jako aktywny: polecenie ma pominąć termin
        // odwołany z powodu samego terminu, nie tylko stanu zapisu.
        $this->assertNull($kept->fresh()->cancelled_at);

        $scheduled = $this->slot(Carbon::parse('2026-10-06 19:00:00', config('app.timezone')));
        $reminded = $this->signup($scheduled);

        $this->artisan('supervision:send-reminders')->assertSuccessful();

        Carbon::setTestNow();

        $this->assertSame(
            [$reminded->user_id],
            Notification::query()->where('type', 'supervision.reminder')->pluck('user_id')->all(),
        );
        $this->assertNull($kept->fresh()->reminder_sent_at);
        $this->assertNotNull($reminded->fresh()->reminder_sent_at);
    }

    public function test_migration_is_reversible(): void
    {
        $migration = 'database/migrations/2026_10_02_171500_add_cancellation_to_supervision_slots_table.php';
        $slot = $this->slot(Carbon::now()->addDays(2));

        $this->assertTrue(Schema::hasColumns('supervision_slots', ['cancelled_at', 'cancelled_by']));

        $this->assertSame(0, $this->artisan('migrate:rollback', ['--path' => $migration])->run());

        $this->assertFalse(Schema::hasColumn('supervision_slots', 'cancelled_at'));
        $this->assertFalse(Schema::hasColumn('supervision_slots', 'cancelled_by'));
        $this->assertSame(1, DB::table('supervision_slots')->where('id', $slot->id)->count());

        $this->assertSame(0, $this->artisan('migrate', ['--path' => $migration])->run());

        $this->assertTrue(Schema::hasColumns('supervision_slots', ['cancelled_at', 'cancelled_by']));
        $row = DB::table('supervision_slots')->where('id', $slot->id)->first();
        $this->assertNull($row->cancelled_at);
        $this->assertNull($row->cancelled_by);
    }

    public function test_cancelling_twice_is_409_and_sends_no_second_notification(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->addDays(2));
        $this->signup($slot);

        $this->actingAs($admin, 'keycloak')
            ->deleteJson("/api/v1/admin/supervision/slots/{$slot->id}")
            ->assertOk();
        $cancelledAt = $slot->fresh()->cancelled_at;
        $notifications = Notification::query()->count();

        $this->actingAs($admin, 'keycloak')
            ->deleteJson("/api/v1/admin/supervision/slots/{$slot->id}")
            ->assertStatus(409)
            ->assertExactJson(['error' => [
                'status' => 409,
                'code' => 'slot_cancelled',
                'message' => 'Ten termin jest już odwołany.',
            ]]);

        $this->assertSame(2, $notifications);
        $this->assertSame($notifications, Notification::query()->count());
        $this->assertSame(1, AuditLogEntry::query()->where('action', 'supervision.slot_cancelled')->count());
        $this->assertEquals($cancelledAt, $slot->fresh()->cancelled_at);
    }

    public function test_cancelled_slot_cannot_be_edited(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->addDays(2));
        $slot->forceFill(['cancelled_at' => now(), 'cancelled_by' => $admin->id])->save();

        $expected = ['error' => [
            'status' => 409,
            'code' => 'slot_cancelled',
            'message' => 'Odwołanego terminu nie można zmienić.',
        ]];

        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", ['seats_limit' => 9])
            ->assertStatus(409)
            ->assertExactJson($expected);

        // Stan terminu rozstrzyga przed walidacją ciała: niepoprawne ciało
        // dostaje to samo 409, nie 422.
        $this->actingAs($admin, 'keycloak')
            ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", ['seats_limit' => 0, 'starts_at' => 'nie-data'])
            ->assertStatus(409)
            ->assertExactJson($expected);

        $this->assertSame(3, $slot->fresh()->seats_limit);
    }

    public function test_unknown_slot_is_404_before_the_body_is_validated(): void
    {
        $admin = User::factory()->role('project_manager')->create();

        $this->actingAs($admin, 'keycloak')
            ->patchJson('/api/v1/admin/supervision/slots/999999', ['seats_limit' => 0])
            ->assertStatus(404)
            ->assertExactJson(['error' => [
                'status' => 404,
                'code' => 'not_found',
                'message' => 'Nie znaleziono terminu.',
            ]]);
    }

    public function test_participant_no_longer_sees_a_cancelled_slot_and_cannot_sign_up(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->addDays(2));
        $other = SupervisionSlot::create([
            'supervisor_id' => $slot->supervisor_id,
            'starts_at' => Carbon::now()->addDays(4),
            'duration_minutes' => 90,
            'seats_limit' => 3,
        ]);
        $volunteer = User::factory()->create(['role' => 'volunteer']);
        SupervisorAssignment::create([
            'volunteer_id' => $volunteer->id,
            'supervisor_id' => $slot->supervisor_id,
            'assigned_at' => now(),
        ]);

        $this->actingAs($volunteer, 'keycloak')
            ->postJson("/api/v1/supervision/slots/{$slot->id}/signup")
            ->assertCreated();

        $this->actingAs($admin, 'keycloak')
            ->deleteJson("/api/v1/admin/supervision/slots/{$slot->id}")
            ->assertOk()
            ->assertJsonPath('data.signups_released', 1);

        $this->actingAs($volunteer, 'keycloak')
            ->getJson('/api/v1/supervision/slots')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $other->id);

        $cancelled = $this->actingAs($volunteer, 'keycloak')
            ->postJson("/api/v1/supervision/slots/{$slot->id}/signup")
            ->assertStatus(404);
        $missing = $this->actingAs($volunteer, 'keycloak')
            ->postJson('/api/v1/supervision/slots/999999/signup')
            ->assertStatus(404);
        $this->assertSame($missing->getContent(), $cancelled->getContent());
        $this->assertSame('Nie znaleziono terminu.', $cancelled->json('error.message'));

        $this->actingAs($volunteer, 'keycloak')
            ->deleteJson("/api/v1/supervision/slots/{$slot->id}/signup")
            ->assertStatus(404);

        $this->assertSame(0, SupervisionSignup::query()->where('slot_id', $slot->id)->whereNull('cancelled_at')->count());
    }

    public function test_instructor_group_no_longer_lists_a_cancelled_slot(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->addDays(2));
        $kept = SupervisionSlot::create([
            'supervisor_id' => $slot->supervisor_id,
            'starts_at' => Carbon::now()->addDays(4),
            'duration_minutes' => 90,
            'seats_limit' => 3,
        ]);
        $instructor = User::query()->findOrFail($slot->supervisor_id);

        $this->actingAs($admin, 'keycloak')
            ->deleteJson("/api/v1/admin/supervision/slots/{$slot->id}")
            ->assertOk();

        $slots = $this->actingAs($instructor, 'keycloak')
            ->getJson('/api/v1/instructor/group')
            ->assertOk()
            ->json('data.slots');

        $this->assertSame([$kept->id], array_column($slots, 'id'));
        $this->assertSame('scheduled', $slots[0]['status']);
    }

    public function test_attendance_cannot_be_marked_on_a_cancelled_slot(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $member = User::factory()->create(['role' => 'volunteer']);
        $past = SupervisionSlot::create([
            'supervisor_id' => $instructor->id,
            'starts_at' => Carbon::now()->subDays(2),
            'duration_minutes' => 90,
            'seats_limit' => 3,
        ]);
        $signup = SupervisionSignup::create([
            'slot_id' => $past->id,
            'user_id' => $member->id,
            'signed_up_at' => Carbon::now()->subDays(3),
        ]);

        // Kontrola dodatnia: ten sam termin przed odwołaniem przyjmuje obecność.
        $this->actingAs($instructor, 'keycloak')
            ->patchJson("/api/v1/instructor/slots/{$past->id}/attendance", ['attendance' => [(string) $member->id => 'present']])
            ->assertOk();

        $past->forceFill(['cancelled_at' => now()])->save();

        $missing = $this->actingAs($instructor, 'keycloak')
            ->patchJson('/api/v1/instructor/slots/999999/attendance', ['attendance' => [(string) $member->id => 'absent']])
            ->assertStatus(404);
        $cancelled = $this->actingAs($instructor, 'keycloak')
            ->patchJson("/api/v1/instructor/slots/{$past->id}/attendance", ['attendance' => [(string) $member->id => 'absent']])
            ->assertStatus(404);
        // Przed walidacją ciała: niepoprawne ciało na odwołanym terminie to też 404.
        $cancelledBadBody = $this->actingAs($instructor, 'keycloak')
            ->patchJson("/api/v1/instructor/slots/{$past->id}/attendance", ['attendance' => 'zle'])
            ->assertStatus(404);

        $this->assertSame($missing->getContent(), $cancelled->getContent());
        $this->assertSame($missing->getContent(), $cancelledBadBody->getContent());
        $this->assertSame('present', $signup->fresh()->attendance);
    }

    public function test_foreign_slot_attendance_is_the_same_404_before_the_body_is_validated(): void
    {
        $instructor = User::factory()->role('instructor')->create();
        $foreign = SupervisionSlot::create([
            'supervisor_id' => User::factory()->role('instructor')->create()->id,
            'starts_at' => Carbon::now()->subDays(2),
            'duration_minutes' => 90,
            'seats_limit' => 3,
        ]);

        $missing = $this->actingAs($instructor, 'keycloak')
            ->patchJson('/api/v1/instructor/slots/999999/attendance', ['attendance' => 'zle'])
            ->assertStatus(404);
        $foreignResponse = $this->actingAs($instructor, 'keycloak')
            ->patchJson("/api/v1/instructor/slots/{$foreign->id}/attendance", ['attendance' => 'zle'])
            ->assertStatus(404);

        $this->assertSame($missing->getContent(), $foreignResponse->getContent());
    }

    public function test_guest_gets_401(): void
    {
        $slot = $this->slot(Carbon::now()->addDays(2));

        $this->deleteJson("/api/v1/admin/supervision/slots/{$slot->id}")
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
        $this->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", ['seats_limit' => 9])
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');

        $fresh = $slot->fresh();
        $this->assertNull($fresh->cancelled_at);
        $this->assertSame(3, $fresh->seats_limit);
    }

    public function test_cancel_is_refused_for_a_started_slot_and_leaves_everything_in_place(): void
    {
        $admin = User::factory()->role('project_manager')->create();
        $slot = $this->slot(Carbon::now()->subMinutes(10));
        $this->signup($slot);

        $this->actingAs($admin, 'keycloak')
            ->deleteJson("/api/v1/admin/supervision/slots/{$slot->id}")
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertDatabaseHas('supervision_slots', ['id' => $slot->id]);
        $this->assertSame(0, Notification::query()->count());
        $this->assertSame(0, AuditLogEntry::query()->where('action', 'supervision.slot_cancelled')->count());
    }

    public function test_unknown_slot_is_404_for_update_and_cancel(): void
    {
        $admin = User::factory()->role('project_manager')->create();

        $this->actingAs($admin, 'keycloak')
            ->patchJson('/api/v1/admin/supervision/slots/999999', ['seats_limit' => 4])
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->actingAs($admin, 'keycloak')
            ->deleteJson('/api/v1/admin/supervision/slots/999999')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    public function test_instructor_and_volunteer_cannot_manage_slots(): void
    {
        $slot = $this->slot(Carbon::now()->addDays(2));
        $instructor = User::query()->findOrFail($slot->supervisor_id);
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        foreach ([$instructor, $volunteer] as $user) {
            $this->actingAs($user, 'keycloak')
                ->patchJson("/api/v1/admin/supervision/slots/{$slot->id}", ['seats_limit' => 9])
                ->assertStatus(403);
            $this->actingAs($user, 'keycloak')
                ->deleteJson("/api/v1/admin/supervision/slots/{$slot->id}")
                ->assertStatus(403);
        }

        $fresh = $slot->fresh();
        $this->assertSame(3, $fresh->seats_limit);
        $this->assertNull($fresh->cancelled_at);
        $this->assertNull($fresh->cancelled_by);
        $this->assertSame(0, Notification::query()->count());
    }

    public function test_instructor_slot_creation_keeps_its_behaviour_through_the_shared_service(): void
    {
        $instructor = User::factory()->role('instructor')->create();

        $this->actingAs($instructor, 'keycloak')
            ->postJson('/api/v1/instructor/slots', [
                'starts_at' => Carbon::now()->subDay()->toIso8601ZuluString(),
            ])
            ->assertStatus(422)
            ->assertExactJson(['error' => [
                'status' => 422,
                'code' => 'validation_failed',
                'message' => 'Termin musi rozpoczynać się w przyszłości.',
                'errors' => ['starts_at' => ['Termin musi rozpoczynać się w przyszłości.']],
            ]]);

        $this->actingAs($instructor, 'keycloak')
            ->postJson('/api/v1/instructor/slots', [
                'starts_at' => Carbon::now()->addDays(3)->toIso8601ZuluString(),
            ])
            ->assertCreated()
            ->assertJsonPath('data.duration_minutes', 90)
            ->assertJsonPath('data.seats_limit', 3);
    }

    private function slot(Carbon $startsAt): SupervisionSlot
    {
        return SupervisionSlot::create([
            'supervisor_id' => User::factory()->role('instructor')->create()->id,
            'starts_at' => $startsAt,
            'duration_minutes' => 90,
            'seats_limit' => 3,
            'location_or_link' => 'Sala A',
        ]);
    }

    private function signup(SupervisionSlot $slot): SupervisionSignup
    {
        return SupervisionSignup::create([
            'slot_id' => $slot->id,
            'user_id' => User::factory()->create(['role' => 'volunteer'])->id,
            'signed_up_at' => now(),
        ]);
    }
}
