<?php

namespace Tests\Feature\Emails;

use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Support\Emails\EmailTemplates;
use App\Support\NotificationTypes;
use App\Support\Notify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Osoba wyłącza dla siebie e-maile oznaczone „Osoba może wyłączyć w Profilu”
 * (`GET`/`PUT /notifications/preferences`); dzwonek zostaje. E-maili
 * „Wychodzi zawsze” i „Wyłącza tylko administracja” osoba nie wyłączy.
 */
class PersonalEmailSwitchTest extends TestCase
{
    use RefreshDatabase;

    public function test_list_marks_which_e_mails_the_person_can_switch_off(): void
    {
        $person = User::factory()->role('volunteer')->create();

        $rows = collect($this->actingAs($person, 'keycloak')
            ->getJson('/api/v1/notifications/preferences')
            ->assertOk()
            ->json('data'))->keyBy('type');

        $this->assertSame(NotificationTypes::ALL, $rows->keys()->all());
        $this->assertTrue($rows['internship.accepted']['switchable']);
        $this->assertTrue($rows['access.expiring_7d']['switchable']);
        $this->assertTrue($rows['cooperation_request.created']['switchable']);
        $this->assertFalse($rows['access.expired']['switchable']);
        $this->assertFalse($rows['message.received']['switchable']);
        $this->assertFalse($rows['application.accepted']['switchable']);
        $this->assertTrue($rows['internship.accepted']['email']);
    }

    public function test_switchable_e_mail_is_switched_off_and_the_bell_stays(): void
    {
        $person = User::factory()->role('volunteer')->create();

        $this->actingAs($person, 'keycloak')
            ->putJson('/api/v1/notifications/preferences', [
                'preferences' => [['type' => 'internship.accepted', 'email' => false]],
            ])
            ->assertOk()
            ->assertJsonFragment(['type' => 'internship.accepted', 'email' => false, 'switchable' => true]);

        Notify::send($person, 'internship.accepted', 'Wpis stażu zaakceptowany', 'Treść.', '/panel/staz');

        $this->assertSame(1, Notification::query()->where('user_id', $person->id)->count());
        $this->assertSame(0, EmailMessage::query()->where('to_user_id', $person->id)->count());
    }

    public function test_e_mail_switched_on_again_is_sent(): void
    {
        $person = User::factory()->role('volunteer')->create();
        NotificationPreference::create(['user_id' => $person->id, 'type' => 'internship.accepted', 'email' => false]);

        $this->actingAs($person, 'keycloak')
            ->putJson('/api/v1/notifications/preferences', [
                'preferences' => [['type' => 'internship.accepted', 'email' => true]],
            ])->assertOk();

        Notify::send($person, 'internship.accepted', 'Wpis stażu zaakceptowany', 'Treść.', '/panel/staz');

        $this->assertSame(1, EmailMessage::query()->where('to_user_id', $person->id)->count());
    }

    public function test_e_mail_only_administration_switches_off_cannot_be_switched_off_by_the_person(): void
    {
        $person = User::factory()->role('volunteer')->create();

        $this->actingAs($person, 'keycloak')
            ->putJson('/api/v1/notifications/preferences', [
                'preferences' => [['type' => 'access.expired', 'email' => false]],
            ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors', ['preferences.0.email' => ['Tego e-maila nie można wyłączyć.']]);

        $this->assertSame(0, NotificationPreference::query()->count());
    }

    public function test_bell_only_type_has_no_e_mail_to_switch_off(): void
    {
        $person = User::factory()->role('volunteer')->create();

        $this->actingAs($person, 'keycloak')
            ->putJson('/api/v1/notifications/preferences', [
                'preferences' => [['type' => 'message.received', 'email' => false]],
            ])->assertStatus(422);
    }

    public function test_a_stored_preference_never_stops_an_e_mail_the_person_cannot_switch_off(): void
    {
        $person = User::factory()->role('volunteer')->create();
        NotificationPreference::create(['user_id' => $person->id, 'type' => 'access.expired', 'email' => false]);

        Notify::send($person, 'access.expired', 'Dostęp do materiałów się zakończył', 'Treść.', '/dostep-wygasl');

        $this->assertSame(1, EmailMessage::query()->where('to_user_id', $person->id)->count());
        $this->assertSame(EmailTemplates::ADMIN, EmailTemplates::switchMode('E-30'));
    }
}
