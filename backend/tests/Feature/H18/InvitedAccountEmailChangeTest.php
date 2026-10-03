<?php

namespace Tests\Feature\H18;

use App\Http\Resources\LinkTokenMask;
use App\Models\Application;
use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\EmailMessage;
use App\Models\User;
use App\Services\H03\ApplicationInvitationMailer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mime\Email;
use Tests\Concerns\ActsWithRealmToken;
use Tests\TestCase;

/**
 * H18 · zmiana adresu konta, które czeka na pierwsze powiązanie: nowe
 * zaproszenie na nowy adres, stary token nieważny; podgląd skrzynki
 * (`GET /admin/emails`) nie pokazuje tokenów nikomu. Wartości tokenów nie
 * trafiają do komunikatów asercji.
 */
class InvitedAccountEmailChangeTest extends TestCase
{
    use ActsWithRealmToken;
    use RefreshDatabase;

    private const OLD_ADDRESS = 'osoba.zaproszona@example.test';

    private const NEW_ADDRESS = 'osoba.nowy.adres@example.test';

    protected function setUp(): void
    {
        parent::setUp();
        Edition::factory()->create(['status' => 'active']);
    }

    private function invitedByAdministration(User $sa): User
    {
        $this->withTokenOf($sa)->postJson('/api/v1/admin/users', [
            'first_name' => 'Filip', 'last_name' => 'Demo', 'email' => self::OLD_ADDRESS, 'role' => 'volunteer',
        ])->assertCreated();

        $user = User::query()->where('email', self::OLD_ADDRESS)->firstOrFail();
        $this->assertNull($user->keycloak_sub);
        $this->assertNotNull($user->activation_token);

        return $user;
    }

    private function mailboxHasNoTokenOf(User $viewer, string $token): void
    {
        $bodies = collect($this->withTokenOf($viewer)->getJson('/api/v1/admin/emails?per_page=100')->assertOk()->json('data'))
            ->pluck('body_html')
            ->filter()
            ->values();

        $this->assertNotEmpty($bodies);
        foreach ($bodies as $body) {
            $this->assertFalse(str_contains($body, $token), 'token widoczny w podglądzie [pominięto]');
            $this->assertSame(0, preg_match('/token=(?!'.preg_quote(LinkTokenMask::MASK, '/').')/', $body), 'niezamaskowany parametr token [pominięto]');
        }
    }

    public function test_mailbox_preview_masks_the_invitation_link_for_every_administration_role(): void
    {
        $sa = $this->boundAccount('super_admin');
        $pm = $this->boundAccount('project_manager');
        $invited = $this->invitedByAdministration($sa);

        foreach ([$pm, $sa] as $viewer) {
            $this->mailboxHasNoTokenOf($viewer, (string) $invited->activation_token);
        }

        $stored = EmailMessage::query()->where('to_email', self::OLD_ADDRESS)->sole();
        $this->assertTrue(str_contains((string) $stored->body_html, (string) $invited->activation_token), 'adresat dostaje pełny odnośnik [pominięto]');
    }

    public function test_masking_keeps_the_rest_of_the_message(): void
    {
        $body = 'Link: <a href="https://psychon.test/aktywacja?token=Abc123">Połącz</a> i https://x.test/a?b=1&amp;token=Zz9 koniec';

        $this->assertSame(
            'Link: <a href="https://psychon.test/aktywacja?token=[ukryto]">Połącz</a> i https://x.test/a?b=1&amp;token=[ukryto] koniec',
            LinkTokenMask::apply($body),
        );
        $this->assertSame('Bez odnośnika.', LinkTokenMask::apply('Bez odnośnika.'));
    }

    public function test_new_address_gets_a_new_invitation_and_the_old_token_stops_working(): void
    {
        $sa = $this->boundAccount('super_admin');
        $pm = $this->boundAccount('project_manager');
        $invited = $this->invitedByAdministration($sa);
        $oldToken = (string) $invited->activation_token;

        $this->withTokenOf($pm)->patchJson("/api/v1/admin/users/{$invited->id}", ['email' => self::NEW_ADDRESS])->assertOk();

        $after = $invited->fresh();
        $newToken = (string) $after->activation_token;
        $this->assertSame(self::NEW_ADDRESS, $after->email);
        $this->assertNotSame('', $newToken);
        $this->assertFalse(hash_equals($oldToken, $newToken), 'token bez zmiany [pominięto]');

        $message = EmailMessage::query()->where('to_email', self::NEW_ADDRESS)->sole();
        $this->assertSame($invited->id, $message->to_user_id);
        $this->assertSame('simulated', $message->status);
        $this->assertTrue(str_contains((string) $message->body_html, '/aktywacja?token='.$newToken), 'nowe zaproszenie bez nowego tokenu [pominięto]');

        $entry = AuditLogEntry::query()->where('action', 'user.updated')->where('subject_id', $invited->id)->sole();
        $this->assertSame(['changed' => ['email'], 'invitation_renewed' => true], $entry->details);

        $this->mailboxHasNoTokenOf($pm, $newToken);

        // Stary token nie wiąże już konta, nawet z tożsamością o nowym adresie.
        $this->bindWithInvitation(self::NEW_ADDRESS, $oldToken)
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_token');
        $this->assertNull($invited->fresh()->keycloak_sub);

        // Adresat nowego zaproszenia wiąże konto nowym tokenem.
        $this->bindWithInvitation(self::NEW_ADDRESS, $newToken)
            ->assertOk()
            ->assertJsonPath('data.id', $invited->id);
        $this->assertNull($invited->fresh()->activation_token);
    }

    public function test_account_from_an_accepted_application_gets_the_invitation_mail_again(): void
    {
        $captured = [];
        Mail::shouldReceive('raw')
            ->once()
            ->andReturnUsing(function (string $body, \Closure $callback) use (&$captured): void {
                $message = new Message(new Email);
                $callback($message);
                $captured[] = ['to' => (string) $message->getTo()[0]->getAddress(), 'subject' => $message->getSubject(), 'body' => $body];
            });

        $sa = $this->boundAccount('super_admin');
        $invited = User::factory()->role('volunteer')->invited()->create([
            'email' => self::OLD_ADDRESS, 'status' => 'invited', 'keycloak_sub' => null,
        ]);
        Application::factory()->accepted()->create([
            'email' => self::OLD_ADDRESS, 'user_id' => $invited->id, 'decided_at' => now(),
        ]);
        $oldToken = (string) $invited->activation_token;

        $this->withTokenOf($sa)->patchJson("/api/v1/admin/users/{$invited->id}", ['email' => self::NEW_ADDRESS])->assertOk();

        $newToken = (string) $invited->fresh()->activation_token;
        $this->assertFalse(hash_equals($oldToken, $newToken), 'token bez zmiany [pominięto]');
        $this->assertCount(1, $captured);
        $this->assertSame(self::NEW_ADDRESS, $captured[0]['to']);
        $this->assertSame(ApplicationInvitationMailer::SUBJECT, $captured[0]['subject']);
        $this->assertTrue(str_contains($captured[0]['body'], '/aktywacja?token='.$newToken), 'wiadomość bez nowego tokenu [pominięto]');
        $this->assertSame('invited', $invited->fresh()->status);
    }

    public function test_bound_account_email_change_sends_nothing(): void
    {
        Mail::shouldReceive('raw')->never();

        $sa = $this->boundAccount('super_admin');
        $bound = $this->boundAccount('volunteer', ['email' => self::OLD_ADDRESS, 'activation_token' => null]);
        $before = EmailMessage::query()->count();

        $this->withTokenOf($sa)->patchJson("/api/v1/admin/users/{$bound->id}", ['email' => self::NEW_ADDRESS])->assertOk();

        $this->assertSame($before, EmailMessage::query()->count());
        $this->assertNull($bound->fresh()->activation_token);
        $entry = AuditLogEntry::query()->where('action', 'user.updated')->where('subject_id', $bound->id)->sole();
        $this->assertSame(['changed' => ['email']], $entry->details);
    }

    public function test_other_field_change_keeps_the_invitation(): void
    {
        $sa = $this->boundAccount('super_admin');
        $invited = $this->invitedByAdministration($sa);
        $token = (string) $invited->activation_token;
        $before = EmailMessage::query()->count();

        $this->withTokenOf($sa)->patchJson("/api/v1/admin/users/{$invited->id}", ['first_name' => 'Inne', 'email' => self::OLD_ADDRESS])->assertOk();

        $this->assertTrue(hash_equals($token, (string) $invited->fresh()->activation_token), 'token zmieniony bez zmiany adresu [pominięto]');
        $this->assertSame($before, EmailMessage::query()->count());
    }
}
