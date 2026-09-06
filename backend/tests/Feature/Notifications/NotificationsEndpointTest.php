<?php

namespace Tests\Feature\Notifications;

use App\Models\User;
use App\Support\Notify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * H16 criterion 3: another user's notification by id → 404; "mark all" works;
 * counter lives in meta.extra.unread.
 */
class NotificationsEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_lists_only_the_authenticated_users_notifications_with_unread_counter(): void
    {
        $marta = User::factory()->create();
        $ola = User::factory()->create();

        Notify::send($marta, 'course.unlocked', 'Kurs odblokowany', 'Treść.', '/panel/kursy/2');
        $unread = Notify::send($marta, 'internship.returned', 'Wpis zwrócony', 'Treść.', '/panel/staz');
        Notify::send($ola, 'certificate.ready', 'Certyfikat gotowy', 'Treść.', '/panel/certyfikat');

        $response = $this->actingAs($marta, 'sanctum')->getJson('/api/v1/notifications');

        $response->assertOk();
        $this->assertCount(2, $response->json('data'));
        $this->assertSame(2, $response->json('meta.extra.unread'));
        $this->assertNotEmpty(
            collect($response->json('data'))->firstWhere('id', $unread->id)
        );
    }

    public function test_marking_someone_elses_notification_as_read_returns_404(): void
    {
        $marta = User::factory()->create();
        $ola = User::factory()->create();

        $notification = Notify::send($ola, 'certificate.ready', 'Certyfikat gotowy', 'Treść.', '/panel/certyfikat');

        $response = $this->actingAs($marta, 'sanctum')
            ->postJson("/api/v1/notifications/{$notification->id}/read");

        $response->assertStatus(404)->assertJsonPath('error.code', 'not_found');
    }

    public function test_marking_own_notification_as_read_sets_read_at(): void
    {
        $marta = User::factory()->create();
        $notification = Notify::send($marta, 'course.unlocked', 'Kurs odblokowany', 'Treść.', '/panel/kursy/2');

        $response = $this->actingAs($marta, 'sanctum')
            ->postJson("/api/v1/notifications/{$notification->id}/read");

        $response->assertOk();
        $this->assertNotNull($response->json('data.read_at'));
        $this->assertNotNull($notification->fresh()->read_at);
    }

    public function test_mark_all_marks_every_unread_notification_for_the_user_only(): void
    {
        $marta = User::factory()->create();
        $ola = User::factory()->create();

        Notify::send($marta, 'course.unlocked', 'A', 'A.', '/a');
        Notify::send($marta, 'internship.returned', 'B', 'B.', '/b');
        $olaNotification = Notify::send($ola, 'certificate.ready', 'C', 'C.', '/c');

        $response = $this->actingAs($marta, 'sanctum')->postJson('/api/v1/notifications/read-all');

        $response->assertOk();
        $this->assertSame(2, $response->json('data.updated'));

        $this->assertSame(
            0,
            $this->actingAs($marta, 'sanctum')->getJson('/api/v1/notifications')->json('meta.extra.unread')
        );
        $this->assertNull($olaNotification->fresh()->read_at);
    }

    public function test_notifications_endpoint_requires_authentication(): void
    {
        $this->getJson('/api/v1/notifications')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }
}
