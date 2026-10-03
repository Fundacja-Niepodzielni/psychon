<?php

namespace Tests\Feature\H03;

use App\Models\Application;
use App\Models\Edition;
use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\User;
use App\Services\H03\ApplicationRejectionMailer;
use App\Support\NotificationSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

/**
 * Wiadomość z powodem odrzucenia do kandydata: dokładnie jedna, na adres ze
 * zgłoszenia, wyłącznie po zatwierdzonej decyzji. Żadna próba nie wysyła
 * poczty naprawdę — mailer jest atrapą (`Mail::shouldReceive`) albo mailerem
 * `array` z konfiguracji prób.
 */
class ApplicationRejectionMailTest extends TestCase
{
    use RefreshDatabase;

    private const CANDIDATE = 'odrzucona.kandydatka@example.test';

    private const REASON = 'Brak dyplomu ukończonych studiów psychologicznych.';

    private function application(array $attributes = []): Application
    {
        return Application::factory()->create(['email' => self::CANDIDATE, ...$attributes]);
    }

    private function actingAsAdmin(string $role = 'project_manager'): User
    {
        $actor = User::factory()->role($role)->create();
        $this->actingAs($actor, 'keycloak');

        return $actor;
    }

    private function reject(Application|int $application, mixed $reason = self::REASON)
    {
        $id = $application instanceof Application ? $application->id : $application;

        return $this->postJson('/api/v1/admin/applications/'.$id.'/reject', $reason === null ? [] : ['reason' => $reason]);
    }

    private function candidateMails(): int
    {
        return EmailMessage::query()->where('to_email', self::CANDIDATE)->count();
    }

    public function test_rejection_sends_exactly_one_mail_to_the_candidate_with_the_reason(): void
    {
        $captured = [];
        Mail::shouldReceive('raw')
            ->once()
            ->with(\Mockery::type('string'), \Mockery::type('Closure'))
            ->andReturnUsing(function (string $body, \Closure $callback) use (&$captured): void {
                $message = new Message(new Email);
                $callback($message);
                $captured['subject'] = $message->getSubject();
                $captured['to'] = array_map(fn ($address) => $address->getAddress(), $message->getTo());
                $captured['body'] = $body;
            });

        $application = $this->application();
        $this->actingAsAdmin();

        $this->reject($application, '  '.self::REASON.'  ')
            ->assertOk()
            ->assertJsonPath('data.id', $application->id)
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.rejection_reason', self::REASON)
            ->assertJsonPath('data.rejection_mail', 'sent');

        $this->assertSame([self::CANDIDATE], $captured['to']);
        $this->assertSame('PsychON: decyzja w sprawie zgłoszenia', $captured['subject']);
        // Treść to szablon E-02: powód odrzucenia w liście szczegółów.
        $this->assertSame(ApplicationRejectionMailer::email(self::REASON)->text, $captured['body']);
        $this->assertStringContainsString("\n\nPowód: ".self::REASON."\n\n", $captured['body']);

        $row = EmailMessage::query()->where('to_email', self::CANDIDATE)->sole();
        $this->assertSame('sent', $row->status);
        $this->assertNull($row->to_user_id);
        $this->assertSame(ApplicationRejectionMailer::SUBJECT, $row->subject);
        $this->assertSame($application->getMorphClass(), $row->related_type);
        $this->assertSame($application->id, (int) $row->related_id);
        $this->assertNotNull($row->sent_at);
        $this->assertStringContainsString(e(self::REASON), (string) $row->body_html);
    }

    public function test_mail_goes_out_even_when_the_notification_type_is_switched_off(): void
    {
        Mail::shouldReceive('raw')->once();
        NotificationSettings::put(['types' => [['type' => 'application.rejected', 'enabled' => false]]]);

        $application = $this->application();
        $actor = $this->actingAsAdmin('super_admin');

        $this->reject($application)
            ->assertOk()
            ->assertJsonPath('data.rejection_mail', 'sent');

        // Przełącznik dotyczy wyłącznie notatki dla osoby decydującej.
        $this->assertSame(0, Notification::query()->where('user_id', $actor->id)->count());
        $this->assertSame(1, $this->candidateMails());
    }

    public function test_failed_rejection_mail_still_rejects_and_marks_delivery_failed(): void
    {
        Mail::shouldReceive('raw')->once()->andThrow(new \RuntimeException('smtp niedostepny'));

        $application = $this->application();
        $actor = $this->actingAsAdmin();

        $this->reject($application)
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.rejection_mail', 'failed');

        $fresh = $application->fresh();
        $this->assertSame('rejected', $fresh->status);
        $this->assertSame(self::REASON, $fresh->rejection_reason);
        $this->assertSame($actor->id, $fresh->decided_by);

        $row = EmailMessage::query()->where('to_email', self::CANDIDATE)->sole();
        $this->assertSame('failed', $row->status);
        $this->assertNull($row->sent_at);
        $this->assertDatabaseHas('audit_log', ['action' => 'application.rejected', 'subject_id' => $application->id]);
    }

    public function test_mail_failure_log_carries_no_address_and_no_reason(): void
    {
        // Wyjątek mailera sam niesie adres i powód — dziennik nie może ich przepisać.
        Mail::shouldReceive('raw')->once()->andThrow(
            new \RuntimeException('550 odrzucono '.self::CANDIDATE.' '.self::REASON),
        );
        $logged = [];
        Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged): void {
            $logged[] = $event;
        });

        $application = $this->application();
        $this->actingAsAdmin();

        $this->reject($application)->assertOk()->assertJsonPath('data.rejection_mail', 'failed');

        $failures = array_values(array_filter(
            $logged,
            fn (MessageLogged $event): bool => $event->message === 'application.rejection_mail_failed',
        ));
        $this->assertCount(1, $failures);
        $this->assertSame('warning', $failures[0]->level);
        $this->assertSame($application->id, $failures[0]->context['application_id']);
        $this->assertSame(\RuntimeException::class, $failures[0]->context['exception']);

        foreach ($logged as $event) {
            $text = $event->message.' '.json_encode($event->context, JSON_UNESCAPED_UNICODE);
            $this->assertStringNotContainsString(self::CANDIDATE, $text);
            $this->assertStringNotContainsString(self::REASON, $text);
            $this->assertStringNotContainsString('odrzucona.kandydatka', $text);
        }
    }

    public function test_no_mail_is_sent_when_the_reason_is_missing(): void
    {
        Mail::shouldReceive('raw')->never();

        $application = $this->application();
        $this->actingAsAdmin();

        foreach ([null, '', '   ', ['tablica']] as $reason) {
            $this->reject($application, $reason)
                ->assertStatus(422)
                ->assertJsonPath('error.code', 'validation_failed')
                ->assertJsonStructure(['error' => ['errors' => ['reason']]]);
        }

        $this->assertSame('new', $application->fresh()->status);
        $this->assertSame(0, $this->candidateMails());
    }

    public function test_reason_longer_than_limit_is_422(): void
    {
        Mail::shouldReceive('raw')->once();

        $application = $this->application();
        $this->actingAsAdmin();

        // Limit liczy znaki, nie bajty: „ż” to dwa bajty w UTF-8.
        $this->reject($application, str_repeat('ż', 2001))
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.errors.reason.0', 'Powód może mieć najwyżej 2000 znaków.');

        $this->assertSame('new', $application->fresh()->status);
        $this->assertSame(0, $this->candidateMails());

        $this->reject($application, str_repeat('ż', 2000))
            ->assertOk()
            ->assertJsonPath('data.rejection_mail', 'sent');

        $this->assertSame(1, $this->candidateMails());
    }

    public function test_second_rejection_is_refused_and_only_one_mail_was_sent(): void
    {
        Mail::shouldReceive('raw')->once();

        $application = $this->application();
        $this->actingAsAdmin('super_admin');

        $this->reject($application)->assertOk()->assertJsonPath('data.rejection_mail', 'sent');
        $this->reject($application, 'Drugi powód.')
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'application_already_decided');

        $this->assertSame(self::REASON, $application->fresh()->rejection_reason);
        $this->assertSame(1, $this->candidateMails());
    }

    public function test_rejecting_an_accepted_application_sends_no_mail(): void
    {
        Mail::shouldReceive('raw')->never();

        $application = $this->application(['status' => 'accepted']);
        $this->actingAsAdmin();

        $this->reject($application)
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'application_already_decided');

        $this->assertSame('accepted', $application->fresh()->status);
        $this->assertSame(0, $this->candidateMails());
    }

    public function test_unknown_application_is_404_and_no_mail(): void
    {
        Mail::shouldReceive('raw')->never();
        Edition::factory()->create(['status' => 'active']);
        $this->actingAsAdmin();

        $this->reject(999999)
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');

        $this->assertSame(0, EmailMessage::query()->count());
    }

    public function test_rolled_back_rejection_sends_no_mail(): void
    {
        Mail::shouldReceive('raw')->never();
        // Awaria wewnątrz transakcji decyzji (zapis notatki) cofa całą decyzję.
        Notification::creating(function (): void {
            throw new \RuntimeException('awaria zapisu notatki');
        });

        $application = $this->application();
        $this->actingAsAdmin();

        $this->withoutExceptionHandling();
        try {
            $this->reject($application);
            $this->fail('Odrzucenie miało się nie powieść.');
        } catch (\RuntimeException $e) {
            $this->assertSame('awaria zapisu notatki', $e->getMessage());
        }

        $this->assertSame('new', $application->fresh()->status);
        $this->assertSame(0, $this->candidateMails());
    }

    public function test_non_admin_roles_cannot_reject_and_no_mail_goes_out(): void
    {
        Mail::shouldReceive('raw')->never();

        $application = $this->application();

        foreach (['volunteer', 'student', 'instructor'] as $role) {
            $this->actingAs(User::factory()->role($role)->create(), 'keycloak');

            // Rola sprawdzana przed walidacją: poprawny, pusty i zbyt długi powód dają to samo 403.
            foreach ([self::REASON, null, '', str_repeat('x', 2001)] as $reason) {
                $this->reject($application, $reason)
                    ->assertForbidden()
                    ->assertJsonPath('error.code', 'forbidden');
            }
        }

        $this->assertSame('new', $application->fresh()->status);
        $this->assertSame(0, EmailMessage::query()->count());
    }

    public function test_rejection_note_for_the_decision_maker_links_to_the_applications_tab(): void
    {
        Mail::shouldReceive('raw')->once();

        $application = $this->application();
        $actor = $this->actingAsAdmin();

        $this->reject($application)->assertOk();

        $note = Notification::query()->where('user_id', $actor->id)->where('type', 'application.rejected')->sole();
        $this->assertSame('/admin/uczestniczki?zakladka=zgloszenia', $note->link);
    }

    public function test_guest_gets_401_and_no_mail(): void
    {
        Mail::shouldReceive('raw')->never();

        $application = $this->application();

        foreach ([self::REASON, null, str_repeat('x', 2001)] as $reason) {
            $this->reject($application, $reason)
                ->assertUnauthorized()
                ->assertJsonPath('error.code', 'unauthenticated');
        }

        $this->assertSame('new', $application->fresh()->status);
        $this->assertSame(0, EmailMessage::query()->count());
    }
}
