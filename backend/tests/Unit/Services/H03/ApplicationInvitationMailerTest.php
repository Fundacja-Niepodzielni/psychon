<?php

namespace Tests\Unit\Services\H03;

use App\Models\Application;
use App\Models\User;
use App\Services\H03\ApplicationInvitationMailer;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Mockery;
use RuntimeException;
use Symfony\Component\Mime\Email;

/**
 * Covers `send()` in isolation with an in-memory (not persisted)
 * `Application`/`User` — no database connection is opened. The full accept
 * flow that calls this mailer through the HTTP endpoint, with a real row,
 * stays with `Tests\Feature\H03\ApplicationInvitationFlowTest`; this suite
 * pins only the mailer's own contract: the fixed subject, the recipient and
 * the activation link on success, and that a mailer failure is reported
 * as a failed send rather than escaping as an exception.
 */
class ApplicationInvitationMailerTest extends TestCase
{
    public function test_it_sends_the_invitation_with_the_fixed_subject_recipient_and_activation_link(): void
    {
        $captured = [];
        Mail::shouldReceive('raw')
            ->once()
            ->with(Mockery::type('string'), Mockery::type('Closure'))
            ->andReturnUsing(function (string $body, \Closure $callback) use (&$captured): void {
                $message = new Message(new Email);
                $callback($message);
                $captured['subject'] = $message->getSubject();
                $captured['to'] = (string) $message->getTo()[0]->getAddress();
                $captured['body'] = $body;
            });

        $application = new Application(['first_name' => 'Ola', 'last_name' => 'Testowa']);
        $user = new User(['email' => 'ola.testowa@example.test']);

        $result = ApplicationInvitationMailer::send(
            $application,
            $user,
            'https://psychon.test/aktywacja?token=abc123',
        );

        $this->assertTrue($result);
        $this->assertSame(ApplicationInvitationMailer::SUBJECT, $captured['subject']);
        $this->assertSame('ola.testowa@example.test', $captured['to']);
        $this->assertStringContainsString('https://psychon.test/aktywacja?token=abc123', $captured['body']);
    }

    public function test_a_mailer_failure_is_reported_as_a_failed_send_without_throwing(): void
    {
        Mail::shouldReceive('raw')->once()->andThrow(new RuntimeException('smtp niedostepny'));
        Log::shouldReceive('warning')
            ->once()
            ->with('application.invitation_mail_failed', Mockery::type('array'));

        $application = new Application(['first_name' => 'Zbyt', 'last_name' => 'Cichy']);
        $user = new User(['email' => 'zbyt.cichy@example.test']);

        $result = ApplicationInvitationMailer::send(
            $application,
            $user,
            'https://psychon.test/aktywacja?token=xyz789',
        );

        $this->assertFalse($result);
    }
}
