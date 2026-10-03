<?php

namespace Tests\Feature\Emails;

use App\Mail\HelpMessageConfirmation;
use App\Mail\HelpMessageReceived;
use App\Models\Application;
use App\Models\EmailMessage;
use App\Models\HelpMessage;
use App\Models\User;
use App\Services\H03\ApplicationInvitationMailer;
use App\Services\H03\ApplicationRejectionMailer;
use App\Support\Emails\EmailRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Events\MessageSent;
use Illuminate\Support\Facades\Event;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

/**
 * E-maile wysyłane poza szyną powiadomień (zaproszenia, odrzucenie
 * zgłoszenia, okno pomocy) korzystają z tego samego układu i tych samych
 * klocków. Transport zostaje dotychczasowy — w próbach mailer `array`.
 */
class DirectMailsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Próby nie mają adresu nadawcy z konfiguracji — bez niego mailer
        // odrzuca wiadomość, zanim powstanie.
        config(['app.frontend_url' => EmailTemplatesTest::BASE_URL, 'mail.from.address' => 'psychon@example.test']);
    }

    /**
     * @return list<Email>
     */
    private function captureSent(callable $send): array
    {
        $sent = [];
        Event::listen(MessageSent::class, function (MessageSent $event) use (&$sent): void {
            $sent[] = $event->message;
        });

        $send();

        return $sent;
    }

    public function test_invitation_after_acceptance_is_e_01_in_html_and_text(): void
    {
        $application = Application::factory()->create(['email' => 'nowa.osoba@example.test']);
        $user = User::factory()->create(['email' => 'nowa.osoba@example.test']);
        $url = EmailTemplatesTest::BASE_URL.'/aktywacja?token=abc123';

        $sent = $this->captureSent(fn () => ApplicationInvitationMailer::send($application, $user, $url));

        $expected = EmailRenderer::render('E-01', ['activationPath' => '/aktywacja?token=abc123']);
        $this->assertCount(1, $sent);
        $this->assertSame('PsychON: zaproszenie do programu', $sent[0]->getSubject());
        $this->assertSame(ApplicationInvitationMailer::SUBJECT, $sent[0]->getSubject());
        $this->assertSame($expected->html, $sent[0]->getHtmlBody());
        $this->assertSame($expected->text, $sent[0]->getTextBody());
        $this->assertStringContainsString("Aktywuj dostęp: {$url}\n", (string) $sent[0]->getTextBody());
    }

    public function test_rejection_is_e_02_and_its_outbox_trace_shows_the_template(): void
    {
        $application = Application::factory()->create(['email' => 'kandydatka@example.test']);
        $reason = 'Liczba miejsc w tej edycji programu jest już wyczerpana.';

        $sent = $this->captureSent(fn () => ApplicationRejectionMailer::send($application, $reason));

        $expected = EmailRenderer::render('E-02', ['reason' => $reason]);
        $this->assertCount(1, $sent);
        $this->assertSame('PsychON: decyzja w sprawie zgłoszenia', $sent[0]->getSubject());
        $this->assertSame($expected->html, $sent[0]->getHtmlBody());
        $this->assertSame($expected->text, $sent[0]->getTextBody());

        $row = EmailMessage::query()->where('to_email', 'kandydatka@example.test')->sole();
        $this->assertSame('sent', $row->status);
        $this->assertSame($expected->subject, $row->subject);
        $this->assertSame($expected->fragment, $row->body_html);
    }

    public function test_invitation_to_an_account_created_by_administration_is_e_03_in_the_outbox(): void
    {
        $admin = User::factory()->role('super_admin')->create();
        $this->actingAs($admin, 'keycloak');

        $this->postJson('/api/v1/admin/users', [
            'first_name' => 'Nowa',
            'last_name' => 'Osoba',
            'email' => 'nowa.osoba@demo.pl',
            'role' => 'volunteer',
        ])->assertCreated();

        $user = User::query()->where('email', 'nowa.osoba@demo.pl')->sole();
        $row = EmailMessage::query()->where('to_user_id', $user->id)->sole();
        $expected = EmailRenderer::render('E-03', ['activationPath' => '/aktywacja?token='.$user->activation_token]);

        $this->assertSame('simulated', $row->status);
        $this->assertSame('PsychON: zaproszenie na platformę', $row->subject);
        $this->assertSame($expected->fragment, $row->body_html);
        $this->assertStringContainsString(EmailTemplatesTest::BASE_URL.'/aktywacja?token='.$user->activation_token, $row->body_html);
    }

    private function helpMessage(): HelpMessage
    {
        $sender = User::factory()->role('instructor')->create([
            'first_name' => 'Anna',
            'last_name' => 'Przykładowa',
            'email' => 'anna.przykladowa@example.com',
        ]);

        return HelpMessage::query()->create([
            'user_id' => $sender->id,
            'role' => 'instructor',
            'screen' => '/prowadzacy/grupa',
            'content' => "Nie widzę listy grupy.\nProszę o pomoc.",
            'reference' => 'POM-000142',
        ]);
    }

    public function test_help_confirmation_is_e_04_with_polish_characters(): void
    {
        $message = $this->helpMessage();
        $expected = EmailRenderer::render('E-04', [
            'reference' => 'POM-000142',
            'content' => "Nie widzę listy grupy.\nProszę o pomoc.",
        ]);

        $mail = new HelpMessageConfirmation($message);

        $mail->assertHasSubject('PsychON: przyjęliśmy zgłoszenie POM-000142');
        $this->assertSame(trim($expected->html), trim($mail->render()));
        $mail->assertSeeInText('Treść zgłoszenia:');
        $mail->assertSeeInText('dziękujemy za zgłoszenie. Ma numer POM-000142.');
        $mail->assertDontSeeInText('Dziekujemy');
    }

    public function test_help_copy_for_the_team_is_e_05_with_who_wrote_it(): void
    {
        $message = $this->helpMessage();
        $expected = EmailRenderer::render('E-05', [
            'reference' => 'POM-000142',
            'requesterName' => 'Anna Przykładowa',
            'requesterEmail' => 'anna.przykladowa@example.com',
            'role' => 'Psycholog prowadzący',
            'screen' => '/prowadzacy/grupa',
            'content' => "Nie widzę listy grupy.\nProszę o pomoc.",
        ]);

        $mail = new HelpMessageReceived($message);

        $mail->assertHasSubject('PsychON: zgłoszenie pomocy POM-000142');
        $this->assertSame(trim($expected->html), trim($mail->render()));
        $mail->assertSeeInText('Rola osoby zgłaszającej: Psycholog prowadzący');
        $mail->assertSeeInText('Adres e-mail: anna.przykladowa@example.com');
        $mail->assertDontSeeInText('Kontakt z Fundacją');
    }
}
