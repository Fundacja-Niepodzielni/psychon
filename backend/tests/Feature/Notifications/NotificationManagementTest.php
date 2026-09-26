<?php

namespace Tests\Feature\Notifications;

use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Support\NotificationTypes;
use App\Support\Notify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_own_notification_can_be_marked_unread_again(): void
    {
        $marta = User::factory()->create();
        $notification = Notify::send($marta, 'course.unlocked', 'Kurs odblokowany', 'Treść.', '/panel/kursy/2');
        $notification->forceFill(['read_at' => now()])->save();

        $this->actingAs($marta, 'keycloak')
            ->postJson("/api/v1/notifications/{$notification->id}/unread")
            ->assertOk()
            ->assertJsonPath('data.id', $notification->id)
            ->assertJsonPath('data.read_at', null);

        $this->assertNull($notification->fresh()->read_at);
    }

    public function test_someone_elses_notification_cannot_be_marked_unread(): void
    {
        $marta = User::factory()->create();
        $ola = User::factory()->create();
        $notification = Notify::send($ola, 'certificate.ready', 'Certyfikat gotowy', 'Treść.');
        $notification->forceFill(['read_at' => now()])->save();

        $this->actingAs($marta, 'keycloak')
            ->postJson("/api/v1/notifications/{$notification->id}/unread")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->assertNotNull($notification->fresh()->read_at);
    }

    public function test_own_notification_can_be_deleted(): void
    {
        $marta = User::factory()->create();
        $notification = Notify::send($marta, 'course.unlocked', 'Kurs odblokowany', 'Treść.');

        $this->actingAs($marta, 'keycloak')
            ->deleteJson("/api/v1/notifications/{$notification->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $notification->id);

        $this->assertDatabaseMissing('notifications', ['id' => $notification->id]);
    }

    public function test_someone_elses_notification_cannot_be_deleted(): void
    {
        $marta = User::factory()->create();
        $ola = User::factory()->create();
        $notification = Notify::send($ola, 'certificate.ready', 'Certyfikat gotowy', 'Treść.');

        $this->actingAs($marta, 'keycloak')
            ->deleteJson("/api/v1/notifications/{$notification->id}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->assertDatabaseHas('notifications', ['id' => $notification->id]);
    }

    public function test_preferences_default_to_email_for_every_known_type(): void
    {
        $marta = User::factory()->create();

        $response = $this->actingAs($marta, 'keycloak')
            ->getJson('/api/v1/notifications/preferences')
            ->assertOk();

        $this->assertSame(NotificationTypes::ALL, array_column($response->json('data'), 'type'));
        $this->assertSame([true], array_values(array_unique(array_column($response->json('data'), 'email'))));
    }

    public function test_preferences_are_stored_per_person_and_type(): void
    {
        $marta = User::factory()->create();
        $ola = User::factory()->create();

        $response = $this->actingAs($marta, 'keycloak')
            ->putJson('/api/v1/notifications/preferences', [
                'preferences' => [['type' => 'supervision.reminder', 'email' => false]],
            ])
            ->assertOk();

        $byType = array_column($response->json('data'), 'email', 'type');
        $this->assertFalse($byType['supervision.reminder']);
        $this->assertTrue($byType['course.unlocked']);

        $this->assertDatabaseHas('notification_preferences', [
            'user_id' => $marta->id,
            'type' => 'supervision.reminder',
            'email' => false,
        ]);
        $this->assertSame(0, NotificationPreference::query()->where('user_id', $ola->id)->count());
    }

    public function test_preferences_reject_unknown_type_and_non_boolean_email(): void
    {
        $marta = User::factory()->create();

        $this->actingAs($marta, 'keycloak')
            ->putJson('/api/v1/notifications/preferences', [
                'preferences' => [['type' => 'not.a.type', 'email' => false]],
            ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->actingAs($marta, 'keycloak')
            ->putJson('/api/v1/notifications/preferences', [
                'preferences' => [['type' => 'course.unlocked', 'email' => 'maybe']],
            ])
            ->assertStatus(422);

        $this->assertSame(0, NotificationPreference::query()->count());
    }

    public function test_email_copy_respects_the_preference_while_the_bell_entry_stays(): void
    {
        $marta = User::factory()->create();
        NotificationPreference::create(['user_id' => $marta->id, 'type' => 'supervision.reminder', 'email' => false]);

        Notify::send($marta, 'supervision.reminder', 'Jutro superwizja', 'Treść.');
        Notify::send($marta, 'course.unlocked', 'Kurs odblokowany', 'Treść.');

        $this->assertSame(2, Notification::query()->where('user_id', $marta->id)->count());
        $this->assertSame(
            ['Kurs odblokowany'],
            EmailMessage::query()->where('to_user_id', $marta->id)->pluck('subject')->all(),
        );
    }

    public function test_management_routes_require_authentication(): void
    {
        $this->postJson('/api/v1/notifications/1/unread')->assertStatus(401);
        $this->deleteJson('/api/v1/notifications/1')->assertStatus(401);
        $this->getJson('/api/v1/notifications/preferences')->assertStatus(401);
        $this->putJson('/api/v1/notifications/preferences', [])->assertStatus(401);
    }
}
