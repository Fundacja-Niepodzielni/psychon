<?php

namespace Tests\Feature\Emails;

use App\Mail\HelpMessageConfirmation;
use App\Mail\HelpMessageReceived;
use App\Models\EmailMessage;
use App\Models\HelpMessage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * E-40 po zablokowaniu konta (bez powodu), kopia zgłoszenia pomocy dla
 * zespołu z danymi osoby zgłaszającej (E-05) oraz okno pomocy po
 * zakończeniu dostępu: formularz działa, treści programu nadal nie.
 */
class AccountEmailsAndHelpTest extends TestCase
{
    use RefreshDatabase;

    private const string REASON = 'Powód blokady wpisany przez administrację.';

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.frontend_url' => EmailTemplatesTest::BASE_URL, 'help.inbox' => 'pomoc@example.test']);
    }

    public function test_e_40_goes_to_the_blocked_person_without_the_reason(): void
    {
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');
        $person = User::factory()->role('volunteer')->create();

        $this->postJson("/api/v1/admin/users/{$person->id}/block", ['reason' => self::REASON])->assertOk();

        $row = EmailMessage::query()->where('to_user_id', $person->id)->sole();
        $this->assertSame('PsychON: konto zablokowane', $row->subject);
        $this->assertSame('simulated', $row->status);
        $this->assertSame($person->email, $row->to_email);
        $this->assertStringContainsString('Twoje konto na platformie PsychON zostało zablokowane.', $row->body_html);
        $this->assertStringNotContainsString(self::REASON, $row->body_html);
        $this->assertStringNotContainsString('Powód', $row->body_html);
    }

    public function test_e_40_does_not_go_when_the_block_is_refused(): void
    {
        $admin = User::factory()->role('super_admin')->create();
        $this->actingAs($admin, 'keycloak');

        $this->postJson("/api/v1/admin/users/{$admin->id}/block", ['reason' => self::REASON])->assertStatus(422);
        $this->postJson('/api/v1/admin/users/999999/block', ['reason' => self::REASON])->assertNotFound();

        $this->assertSame(0, EmailMessage::query()->count());
    }

    public function test_e_05_for_the_team_says_who_wrote_and_e_04_for_the_sender_does_not_repeat_it(): void
    {
        Mail::fake();
        $sender = User::factory()->role('volunteer')->create([
            'first_name' => 'Anna',
            'last_name' => 'Przykładowa',
            'email' => 'anna.przykladowa@example.com',
        ]);

        $this->actingAs($sender, 'keycloak')
            ->postJson('/api/v1/help-messages', ['content' => 'Nie widzę przycisku zapisu.', 'screen' => '/panel/superwizja'])
            ->assertCreated();

        Mail::assertQueued(HelpMessageReceived::class, function (HelpMessageReceived $mail): bool {
            $mail->assertSeeInText('Imię i nazwisko: Anna Przykładowa');
            $mail->assertSeeInText('Adres e-mail: anna.przykladowa@example.com');
            $mail->assertSeeInHtml('href="mailto:anna.przykladowa@example.com"', false);

            return $mail->hasTo('pomoc@example.test');
        });
        Mail::assertQueued(HelpMessageConfirmation::class, function (HelpMessageConfirmation $mail): bool {
            $mail->assertDontSeeInText('Imię i nazwisko');
            $mail->assertDontSeeInText('anna.przykladowa@example.com');

            return $mail->hasTo('anna.przykladowa@example.com');
        });
    }

    public function test_help_form_works_after_access_ended(): void
    {
        Mail::fake();
        $person = User::factory()->role('volunteer')->create([
            'access_expires_at' => now()->subDays(3),
            'program_completed_at' => null,
        ]);

        $this->actingAs($person, 'keycloak')
            ->postJson('/api/v1/help-messages', ['content' => 'Chcę dokończyć program.', 'screen' => '/dostep-wygasl'])
            ->assertCreated()
            ->assertJsonPath('data.reference', fn (string $reference): bool => str_starts_with($reference, 'POM-'));

        $this->assertSame(1, HelpMessage::query()->where('user_id', $person->id)->count());
        Mail::assertQueued(HelpMessageConfirmation::class);
    }

    public function test_program_content_stays_closed_after_access_ended(): void
    {
        $person = User::factory()->role('volunteer')->create([
            'access_expires_at' => now()->subDays(3),
            'program_completed_at' => null,
        ]);

        $this->actingAs($person, 'keycloak')
            ->getJson('/api/v1/courses')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'access_expired');
    }

    public function test_help_form_still_needs_a_signed_in_person(): void
    {
        $this->postJson('/api/v1/help-messages', ['content' => 'Bez logowania.', 'screen' => '/'])
            ->assertStatus(401);

        $this->assertSame(0, HelpMessage::query()->count());
    }
}
