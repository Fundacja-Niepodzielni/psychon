<?php

namespace Tests\Feature\Emails;

use App\Models\AuditLogEntry;
use App\Models\User;
use App\Support\Emails\EmailContact;
use App\Support\Emails\EmailRenderer;
use App\Support\NotificationSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pole „Kontakt w e-mailach” w ustawieniach powiadomień administracji:
 * zapisane w `NotificationSettings` (bez migracji), czytane przez jedyny
 * dostęp `EmailContact`. Pusta wartość usuwa linię kontaktu ze stopki
 * i zdania z kontaktem w ramce „Co dalej”.
 */
class EmailContactTest extends TestCase
{
    use RefreshDatabase;

    private const string CONTACT = 'kontakt@psychon.example.org, tel. 22 000 00 00';

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.frontend_url' => EmailTemplatesTest::BASE_URL]);
    }

    private function admin(): User
    {
        $admin = User::factory()->role('project_manager')->create();
        $this->actingAs($admin, 'keycloak');

        return $admin;
    }

    public function test_administration_reads_and_saves_the_contact(): void
    {
        $this->admin();

        $this->getJson('/api/v1/admin/notification-settings')
            ->assertOk()
            ->assertJsonPath('data.email_contact', null);

        $this->patchJson('/api/v1/admin/notification-settings', ['email_contact' => '  '.self::CONTACT.'  '])
            ->assertOk()
            ->assertJsonPath('data.email_contact', self::CONTACT);

        $this->getJson('/api/v1/admin/notification-settings')
            ->assertOk()
            ->assertJsonPath('data.email_contact', self::CONTACT)
            ->assertJsonPath('data.supervision_reminder.send_at', '08:00');
        $this->assertSame(self::CONTACT, EmailContact::value());
    }

    public function test_emptied_contact_is_stored_as_no_contact(): void
    {
        $this->admin();
        NotificationSettings::put(['email_contact' => self::CONTACT]);

        $this->patchJson('/api/v1/admin/notification-settings', ['email_contact' => ''])
            ->assertOk()
            ->assertJsonPath('data.email_contact', null);

        $this->assertNull(EmailContact::value());
    }

    public function test_saving_other_settings_keeps_the_contact(): void
    {
        $this->admin();
        NotificationSettings::put(['email_contact' => self::CONTACT]);

        $this->patchJson('/api/v1/admin/notification-settings', [
            'types' => [['type' => 'course.unlocked', 'enabled' => false]],
        ])->assertOk()->assertJsonPath('data.email_contact', self::CONTACT);
    }

    public function test_too_long_contact_is_refused(): void
    {
        $this->admin();

        $this->patchJson('/api/v1/admin/notification-settings', ['email_contact' => str_repeat('a', 301)])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['email_contact']]]);

        $this->assertNull(EmailContact::value());
    }

    public function test_contact_does_not_go_into_the_audit_log(): void
    {
        $this->admin();

        $this->patchJson('/api/v1/admin/notification-settings', ['email_contact' => self::CONTACT])->assertOk();

        $entry = AuditLogEntry::query()->where('action', 'notification_settings.updated')->sole();
        $this->assertSame(['types', 'supervision_reminder'], array_keys($entry->details));
        $this->assertStringNotContainsString('kontakt@', (string) json_encode($entry->details));
    }

    public function test_person_cannot_change_the_contact(): void
    {
        $this->actingAs(User::factory()->role('volunteer')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/notification-settings', ['email_contact' => self::CONTACT])->assertStatus(403);
        $this->assertNull(EmailContact::value());
    }

    public function test_footer_shows_the_saved_contact_as_plain_text(): void
    {
        NotificationSettings::put(['email_contact' => self::CONTACT]);

        $email = EmailRenderer::render('E-14');

        $this->assertStringContainsString("\nKontakt z Fundacją: ".self::CONTACT."\n", $email->text);
        $this->assertStringContainsString('Kontakt z Fundacją: kontakt@psychon.example.org, tel. 22 000 00 00</p>', $email->html);
        $this->assertStringNotContainsString('dashed', $email->html);
    }

    public function test_empty_contact_omits_the_footer_line(): void
    {
        $email = EmailRenderer::render('E-14');

        $this->assertStringNotContainsString('Kontakt z Fundacją', $email->text);
        $this->assertStringNotContainsString('Kontakt z Fundacją', $email->html);
        $this->assertStringEndsWith("Powiadomienie w panelu nadal się pojawi.\nFundacja Niepodzielni\n", $email->text);
    }

    public function test_contact_in_the_next_steps_box_follows_the_setting(): void
    {
        NotificationSettings::put(['email_contact' => self::CONTACT]);

        $this->assertStringContainsString(
            'Możesz też skontaktować się z Fundacją: '.self::CONTACT.'.',
            EmailRenderer::render('E-30')->text,
        );
        $this->assertStringContainsString(
            'Co dalej: Jeśli chcesz zachować konto, skontaktuj się z Fundacją: '.self::CONTACT.'.',
            EmailRenderer::render('E-31', ['deletionDate' => '2 listopada 2026 r.'])->text,
        );
        $this->assertStringContainsString(
            'Co dalej: Jeśli masz pytania, skontaktuj się z Fundacją Niepodzielni: '.self::CONTACT.'.',
            EmailRenderer::render('E-40')->text,
        );
    }

    public function test_without_contact_the_sentences_that_need_it_are_left_out(): void
    {
        $e30 = EmailRenderer::render('E-30')->text;
        $e31 = EmailRenderer::render('E-31', ['deletionDate' => '2 listopada 2026 r.'])->text;
        $e40 = EmailRenderer::render('E-40')->text;

        $this->assertStringContainsString('Co dalej: Jeśli chcesz dokończyć program, napisz do Fundacji przez okno „Potrzebujesz pomocy?” w panelu PsychON. Okno pomocy działa także po zakończeniu dostępu.'."\n", $e30);
        $this->assertStringNotContainsString('skontaktować', $e30);
        $this->assertStringNotContainsString('Co dalej', $e31);
        $this->assertStringContainsString('2 listopada 2026 r. usuniemy z niego Twoje dane osobowe', $e31);
        $this->assertStringNotContainsString('Co dalej', $e40);
        $this->assertStringContainsString('Twoje konto na platformie PsychON zostało zablokowane.', $e40);

        foreach ([$e30, $e31, $e40] as $text) {
            $this->assertStringNotContainsString('[', $text);
            $this->assertStringNotContainsString('Kontakt z Fundacją', $text);
        }
    }

    public function test_team_e_mails_never_show_the_contact(): void
    {
        NotificationSettings::put(['email_contact' => self::CONTACT]);

        $email = EmailRenderer::render('E-39');

        $this->assertStringNotContainsString(self::CONTACT, $email->text);
        $this->assertStringNotContainsString(self::CONTACT, $email->html);
    }

    public function test_contact_is_escaped_in_html(): void
    {
        NotificationSettings::put(['email_contact' => 'Biuro <b>Fundacji</b>']);

        $email = EmailRenderer::render('E-14');

        $this->assertStringContainsString('Biuro &lt;b&gt;Fundacji&lt;/b&gt;', $email->html);
        $this->assertStringContainsString('Kontakt z Fundacją: Biuro <b>Fundacji</b>', $email->text);
    }
}
