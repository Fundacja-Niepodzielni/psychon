<?php

namespace Tests\Feature\Notifications;

use App\Models\User;
use App\Support\Notify;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * H16 criterion 4: the sent-mailbox (#/admin/emails) is administration-only
 * and shows recipient, subject, body and time.
 */
class AdminEmailsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_simulated_emails_with_recipient_subject_body_and_time(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin']);
        $marta = User::factory()->create(['email' => 'marta@demo.pl']);

        Notify::send($marta, 'course.unlocked', 'Kurs odblokowany', 'Możesz zacząć etap 2.', '/panel/kursy/2');

        $response = $this->actingAs($admin, 'keycloak')->getJson('/api/v1/admin/emails');

        $response->assertOk()->assertJsonFragment([
            'to_email' => 'marta@demo.pl',
            'subject' => 'Kurs odblokowany',
            'status' => 'simulated',
        ]);

        $email = collect($response->json('data'))->firstWhere('to_email', 'marta@demo.pl');
        $this->assertNotEmpty($email['body_html']);
        $this->assertNotEmpty($email['sent_at']);
    }

    public function test_project_manager_can_also_list_emails(): void
    {
        $pm = User::factory()->create(['role' => 'project_manager']);

        $this->actingAs($pm, 'keycloak')->getJson('/api/v1/admin/emails')->assertOk();
    }

    public function test_non_admin_role_is_forbidden_from_the_email_inbox(): void
    {
        $volunteer = User::factory()->create(['role' => 'volunteer']);

        $this->actingAs($volunteer, 'keycloak')->getJson('/api/v1/admin/emails')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_email_inbox_requires_authentication(): void
    {
        $this->getJson('/api/v1/admin/emails')
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    /**
     * Decyzja architekta: ekran nie twierdzi, jaki jest nadawca — pokazuje to,
     * co naprawdę skonfigurowano (`MAIL_FROM_ADDRESS` / `MAIL_FROM_NAME`).
     * Ten test dowodzi, że punkt dostępowy w ogóle ODDAJE tę wartość, gdy
     * wdrożenie ją naprawdę ustawiło (`mail.from_configured` prawdziwe —
     * patrz `config/mail.php`).
     */
    public function test_email_list_reports_the_actually_configured_sender(): void
    {
        config([
            'mail.from.address' => 'inny.adres@inna.domena.test',
            'mail.from.name' => 'Nazwa Testowa',
            'mail.from_configured' => true,
        ]);

        $admin = User::factory()->create(['role' => 'super_admin']);

        $response = $this->actingAs($admin, 'keycloak')->getJson('/api/v1/admin/emails');

        $response->assertOk()->assertJsonPath('meta.extra.from', [
            'address' => 'inny.adres@inna.domena.test',
            'name' => 'Nazwa Testowa',
        ]);
    }

    /**
     * Bieg BEZ żadnej symulacji: w tym repo `MAIL_FROM_ADDRESS` nie jest
     * ustawiona ani w `phpunit.xml`, ani w `.env.testing`, więc świeża
     * aplikacja startuje z `mail.from_configured === false` naprawdę, a nie
     * przez ręczne `config([...])`. Po decyzji architekta wartość domyślna
     * w `config/mail.php` jest teraz pusta (nie domeną przykładową), więc
     * punkt dostępowy ma oddać `null` zarówno z powodu pustego adresu, jak
     * i z powodu flagi.
     */
    public function test_email_list_reports_null_sender_on_a_genuinely_unconfigured_run(): void
    {
        $this->assertFalse(config('mail.from_configured'), 'w tym środowisku testowym zmienna nie jest ustawiona');
        $this->assertSame('', trim((string) config('mail.from.address')), 'wartość domyślna ma być teraz pusta, nie zmyślona');

        $admin = User::factory()->create(['role' => 'super_admin']);

        $response = $this->actingAs($admin, 'keycloak')->getJson('/api/v1/admin/emails');

        $response->assertOk()->assertJsonPath('meta.extra.from', null);
    }

    /**
     * Ta sama ochrona jak wyżej, ale przez jawne `config([...])` — na
     * wypadek, gdyby środowisko uruchamiające kiedyś ustawiło
     * `MAIL_FROM_ADDRESS` domyślnie (np. w obrazie CI) i pierwszy test
     * przestał być miarodajny.
     */
    public function test_email_list_reports_null_sender_when_address_is_only_the_placeholder_default(): void
    {
        config([
            'mail.from.address' => 'hello@example.com',
            'mail.from.name' => 'Laravel',
            'mail.from_configured' => false,
        ]);

        $admin = User::factory()->create(['role' => 'super_admin']);

        $response = $this->actingAs($admin, 'keycloak')->getJson('/api/v1/admin/emails');

        $response->assertOk()->assertJsonPath('meta.extra.from', null);
    }
}
