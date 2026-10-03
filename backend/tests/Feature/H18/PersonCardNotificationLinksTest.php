<?php

namespace Tests\Feature\H18;

use App\Http\Resources\LinkTokenMask;
use App\Models\Application;
use App\Models\Edition;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsWithRealmToken;
use Tests\TestCase;

/**
 * H18 · karta osoby (`GET /admin/users/{id}`): ostatnie powiadomienia
 * pokazują odnośnik zaproszenia bez wartości tokenu, dla każdej roli
 * administracji — tą samą regułą co podgląd skrzynki. Wartości tokenów nie
 * trafiają do komunikatów asercji.
 */
class PersonCardNotificationLinksTest extends TestCase
{
    use ActsWithRealmToken;
    use RefreshDatabase;

    public function test_person_card_shows_the_invitation_notification_without_its_token_to_every_administration_role(): void
    {
        $edition = Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create([
            'edition_id' => $edition->id,
            'email' => 'karta.zaproszona@example.test',
        ]);
        $sa = $this->boundAccount('super_admin');
        $pm = $this->boundAccount('project_manager');

        $userId = $this->withTokenOf($sa)
            ->postJson("/api/v1/admin/applications/{$application->id}/accept", ['role' => 'volunteer'])
            ->assertCreated()
            ->json('data.user_id');
        $token = (string) User::query()->findOrFail($userId)->activation_token;
        $this->assertNotSame('', $token);

        $stored = Notification::query()->where('user_id', $userId)->where('type', 'application.accepted')->sole();
        $this->assertTrue(str_contains((string) $stored->link, $token), 'osoba dostaje pełny odnośnik [pominięto]');

        foreach ([$pm, $sa] as $viewer) {
            $response = $this->withTokenOf($viewer)->getJson("/api/v1/admin/users/{$userId}")->assertOk();

            $this->assertFalse(str_contains((string) $response->getContent(), $token), 'token widoczny na karcie [pominięto]');

            $notification = collect($response->json('data.recent_notifications'))->firstWhere('type', 'application.accepted');
            $this->assertNotNull($notification);
            $this->assertSame('/aktywacja?token='.LinkTokenMask::MASK, $notification['link']);
            $this->assertStringContainsString('token='.LinkTokenMask::MASK, (string) $notification['body']);
        }
    }

    public function test_notifications_without_a_token_are_shown_unchanged(): void
    {
        $sa = $this->boundAccount('super_admin');
        $person = $this->boundAccount('volunteer');
        Notification::query()->create([
            'user_id' => $person->id,
            'type' => 'internship.accepted',
            'title' => 'Wpis zaakceptowany',
            'body' => 'Wpis stażu został zaakceptowany.',
            'link' => '/panel/staz?wpis=4',
        ]);

        $notification = $this->withTokenOf($sa)->getJson("/api/v1/admin/users/{$person->id}")
            ->assertOk()
            ->json('data.recent_notifications.0');

        $this->assertSame('Wpis stażu został zaakceptowany.', $notification['body']);
        $this->assertSame('/panel/staz?wpis=4', $notification['link']);
    }
}
