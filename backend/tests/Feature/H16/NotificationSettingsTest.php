<?php

namespace Tests\Feature\H16;

use App\Models\AuditLogEntry;
use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\User;
use App\Support\NotificationSettings;
use App\Support\Notify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pakiet H16 · GET/PATCH /admin/notification-settings.
 */
class NotificationSettingsTest extends TestCase
{
    use RefreshDatabase;

    // --- dostęp -----------------------------------------------------------------------

    public function test_volunteer_cannot_read_settings(): void
    {
        $this->actingAs(User::factory()->role('volunteer')->create(), 'keycloak');

        $this->getJson('/api/v1/admin/notification-settings')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_instructor_cannot_read_settings(): void
    {
        $this->actingAs(User::factory()->role('instructor')->create(), 'keycloak');

        $this->getJson('/api/v1/admin/notification-settings')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_student_cannot_read_settings(): void
    {
        $this->actingAs(User::factory()->role('student')->create(), 'keycloak');

        $this->getJson('/api/v1/admin/notification-settings')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_guest_cannot_read_settings(): void
    {
        $this->getJson('/api/v1/admin/notification-settings')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_guest_cannot_update_settings(): void
    {
        $this->patchJson('/api/v1/admin/notification-settings', [
            'supervision_reminder' => ['enabled' => false],
        ])
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_volunteer_cannot_update_settings(): void
    {
        $this->actingAs(User::factory()->role('volunteer')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/notification-settings', [
            'supervision_reminder' => ['enabled' => false],
        ])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertDatabaseMissing('settings', ['key' => 'notification_settings']);
    }

    public function test_instructor_cannot_update_settings(): void
    {
        $this->actingAs(User::factory()->role('instructor')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/notification-settings', [
            'supervision_reminder' => ['enabled' => false],
        ])->assertForbidden();
    }

    public function test_student_cannot_update_settings(): void
    {
        $this->actingAs(User::factory()->role('student')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/notification-settings', [
            'supervision_reminder' => ['enabled' => false],
        ])->assertForbidden();
    }

    // --- domyślny stan ------------------------------------------------------------------

    public function test_default_state_is_everything_enabled_at_eight_oclock(): void
    {
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $response = $this->getJson('/api/v1/admin/notification-settings')->assertOk();

        $response->assertJsonPath('data.supervision_reminder.enabled', true);
        $response->assertJsonPath('data.supervision_reminder.send_at', '08:00');

        $types = collect($response->json('data.types'));
        $this->assertTrue($types->every(fn (array $row): bool => $row['enabled'] === true));
        $this->assertFalse($types->contains('type', 'supervision.reminder'));
    }

    // --- lista przełączników: 20 typów po aneksie kontraktu z 2026-09-28 (2) i trzy typy ---
    // --- e-maili o końcu dostępu i nowym zgłoszeniu współpracy (E-29, E-30, E-39) ----------

    public function test_types_registry_has_the_annex_entries_and_the_three_e_mail_types(): void
    {
        $this->assertCount(23, NotificationSettings::TYPES);
        $this->assertSame(NotificationSettings::TYPES, array_values(array_unique(NotificationSettings::TYPES)));
        $this->assertContains('cooperation_request.answered', NotificationSettings::TYPES);
        $this->assertContains('internship.rejected', NotificationSettings::TYPES);
        $this->assertContains('supervision.slot_cancelled', NotificationSettings::TYPES);
        $this->assertContains('access.expiring_7d', NotificationSettings::TYPES);
        $this->assertContains('access.expired', NotificationSettings::TYPES);
        $this->assertContains('cooperation_request.created', NotificationSettings::TYPES);
        $this->assertNotContains('supervision.reminder', NotificationSettings::TYPES);
    }

    public function test_default_state_includes_the_three_new_types_enabled(): void
    {
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $response = $this->getJson('/api/v1/admin/notification-settings')->assertOk();

        $types = collect($response->json('data.types'))->keyBy('type');
        $this->assertTrue($types['cooperation_request.answered']['enabled']);
        $this->assertTrue($types['internship.rejected']['enabled']);
        $this->assertTrue($types['supervision.slot_cancelled']['enabled']);
    }

    // --- walidacja 422, każdy przypadek osobno -------------------------------------------

    public function test_unknown_type_is_rejected(): void
    {
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/notification-settings', [
            'types' => [['type' => 'not.a.real.type', 'enabled' => false]],
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_supervision_reminder_inside_types_is_rejected(): void
    {
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/notification-settings', [
            'types' => [['type' => 'supervision.reminder', 'enabled' => false]],
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_send_at_with_minutes_is_rejected(): void
    {
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/notification-settings', [
            'supervision_reminder' => ['send_at' => '08:30'],
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_send_at_out_of_range_is_rejected(): void
    {
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/notification-settings', [
            'supervision_reminder' => ['send_at' => '24:00'],
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_send_at_without_leading_zero_is_rejected(): void
    {
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/notification-settings', [
            'supervision_reminder' => ['send_at' => '8:00'],
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_send_at_empty_string_is_rejected(): void
    {
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $response = $this->patchJson('/api/v1/admin/notification-settings', [
            'supervision_reminder' => ['send_at' => ''],
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertArrayHasKey('supervision_reminder.send_at', $response->json('error.errors'));
    }

    public function test_send_at_null_is_rejected(): void
    {
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $response = $this->patchJson('/api/v1/admin/notification-settings', [
            'supervision_reminder' => ['send_at' => null],
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertArrayHasKey('supervision_reminder.send_at', $response->json('error.errors'));
    }

    // --- zapis częściowy + pełny stan -----------------------------------------------------

    public function test_partial_update_returns_full_state(): void
    {
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $response = $this->patchJson('/api/v1/admin/notification-settings', [
            'types' => [['type' => 'course.unlocked', 'enabled' => false]],
        ])->assertOk();

        $types = collect($response->json('data.types'))->keyBy('type');
        $this->assertFalse($types['course.unlocked']['enabled']);
        $this->assertTrue($types['application.accepted']['enabled']);
        $response->assertJsonPath('data.supervision_reminder.enabled', true);
        $response->assertJsonPath('data.supervision_reminder.send_at', '08:00');

        // druga częściowa zmiana zachowuje poprzednią
        $response2 = $this->patchJson('/api/v1/admin/notification-settings', [
            'supervision_reminder' => ['send_at' => '14:00'],
        ])->assertOk();

        $types2 = collect($response2->json('data.types'))->keyBy('type');
        $this->assertFalse($types2['course.unlocked']['enabled']);
        $response2->assertJsonPath('data.supervision_reminder.send_at', '14:00');
        $response2->assertJsonPath('data.supervision_reminder.enabled', true);
    }

    // --- audyt: zapisany, ładunek bez wolnego tekstu --------------------------------------

    public function test_update_writes_audit_entry_with_codes_only(): void
    {
        $admin = User::factory()->role('super_admin')->create();
        $this->actingAs($admin, 'keycloak');

        $this->patchJson('/api/v1/admin/notification-settings', [
            'types' => [['type' => 'course.unlocked', 'enabled' => false]],
            'supervision_reminder' => ['enabled' => false, 'send_at' => '10:00'],
        ])->assertOk();

        $entry = AuditLogEntry::where('action', 'notification_settings.updated')->firstOrFail();
        $this->assertSame($admin->id, $entry->actor_id);

        // ladunek niesie wylacznie kody typow, flagi i send_at — zadnego wolnego tekstu
        $this->assertSame(['types', 'supervision_reminder'], array_keys($entry->details));
        $this->assertSame(['enabled', 'send_at'], array_keys($entry->details['supervision_reminder']));
        $this->assertFalse($entry->details['supervision_reminder']['enabled']);
        $this->assertSame('10:00', $entry->details['supervision_reminder']['send_at']);
        $this->assertFalse($entry->details['types']['course.unlocked']);
        $this->assertContainsOnly('bool', $entry->details['types']);
    }

    // --- Notify::send respektuje wylaczony typ --------------------------------------------

    public function test_disabled_type_creates_no_bell_and_no_email(): void
    {
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');
        $this->patchJson('/api/v1/admin/notification-settings', [
            'types' => [['type' => 'course.unlocked', 'enabled' => false]],
        ])->assertOk();

        $recipient = User::factory()->create();
        $result = Notify::send($recipient, 'course.unlocked', 'Tytul', 'Tresc');

        $this->assertNull($result);
        $this->assertSame(0, Notification::where('type', 'course.unlocked')->count());
        $this->assertSame(0, EmailMessage::where('to_user_id', $recipient->id)->count());
    }

    public function test_enabled_type_still_creates_bell_and_email(): void
    {
        $recipient = User::factory()->create();
        $result = Notify::send($recipient, 'course.unlocked', 'Tytul', 'Tresc');

        $this->assertNotNull($result);
        $this->assertSame(1, Notification::where('type', 'course.unlocked')->count());
        $this->assertSame(1, EmailMessage::where('to_user_id', $recipient->id)->count());
    }

    public function test_type_outside_the_panel_is_always_enabled(): void
    {
        // 'message.received' nie jest na liscie sterowanej tym panelem (§3.1 go nie wymienia)
        $recipient = User::factory()->create();
        $result = Notify::send($recipient, 'message.received', 'Tytul', 'Tresc');

        $this->assertNotNull($result);
        $this->assertSame(1, Notification::where('type', 'message.received')->count());
    }
}
