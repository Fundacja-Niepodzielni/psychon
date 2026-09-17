<?php

namespace Tests\Feature\H03;

use App\Models\Application;
use App\Models\AuditLogEntry;
use App\Models\Consent;
use App\Models\Edition;
use App\Models\User;
use App\Services\H03\ApplicationInvitationMailer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

/**
 * Effects of an accepted application beyond the row itself: the invited
 * account, the outgoing invitation e-mail, the consent dates carried into
 * `consents`, and the audit trail's content.
 */
class ApplicationInvitationFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_acceptance_sends_exactly_one_invitation_mail_with_subject_and_activation_link(): void
    {
        $captured = [];
        Mail::shouldReceive('raw')
            ->once()
            ->with(\Mockery::type('string'), \Mockery::type('Closure'))
            ->andReturnUsing(function (string $body, \Closure $callback) use (&$captured): void {
                $message = new Message(new Email);
                $callback($message);
                $captured['subject'] = $message->getSubject();
                $captured['to'] = (string) $message->getTo()[0]->getAddress();
                $captured['body'] = $body;
            });

        $edition = Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create([
            'edition_id' => $edition->id,
            'email' => 'zaproszona@example.test',
        ]);
        $actor = User::factory()->role('project_manager')->create();
        $this->actingAs($actor, 'keycloak');

        $response = $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', ['role' => 'volunteer'])
            ->assertCreated();

        $this->assertSame('sent', $response->json('data.invitation_mail'));
        $this->assertSame(ApplicationInvitationMailer::SUBJECT, $captured['subject']);
        $this->assertSame('zaproszona@example.test', $captured['to']);
        $this->assertStringContainsString('/aktywacja?token=', $captured['body']);

        $user = User::findOrFail($response->json('data.user_id'));
        $this->assertSame('invited', $user->status);
        $this->assertStringContainsString((string) $user->activation_token, $captured['body']);
    }

    public function test_failed_invitation_mail_still_accepts_the_application_and_marks_delivery_failed(): void
    {
        Mail::shouldReceive('raw')
            ->once()
            ->andThrow(new \RuntimeException('smtp niedostepny'));

        $edition = Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create(['edition_id' => $edition->id, 'email' => 'nieodebrana@example.test']);
        $actor = User::factory()->role('project_manager')->create();
        $this->actingAs($actor, 'keycloak');

        $response = $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', ['role' => 'volunteer'])
            ->assertCreated();

        $this->assertSame('failed', $response->json('data.invitation_mail'));
        $this->assertSame('accepted', $application->fresh()->status);
        $user = User::findOrFail($response->json('data.user_id'));
        $this->assertSame('invited', $user->status);
    }

    public function test_invited_accounts_count_toward_the_edition_seat_limit(): void
    {
        $edition = Edition::factory()->create(['status' => 'active', 'seats_limit' => 1]);
        User::factory()->create(['edition_id' => $edition->id, 'status' => 'invited']);
        $application = Application::factory()->create(['edition_id' => $edition->id]);
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', ['role' => 'volunteer'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'edition_capacity_exceeded')
            ->assertJsonPath('error.reason.active', 1);
    }

    public function test_manual_consent_dates_are_carried_into_consents_on_acceptance(): void
    {
        $edition = Edition::factory()->create(['status' => 'active']);
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');
        $regulamin = now()->subDays(3)->startOfSecond();
        $polityka = now()->subDay()->startOfSecond();

        $created = $this->postJson('/api/v1/admin/applications', [
            'first_name' => 'Ola',
            'last_name' => 'Zgloszona',
            'email' => 'ola.zgloszona@example.test',
            'role' => 'volunteer',
            'consent_regulamin_at' => $regulamin->toIso8601String(),
            'consent_polityka_at' => $polityka->toIso8601String(),
        ])->assertCreated();

        $applicationId = $created->json('data.id');

        $response = $this->postJson('/api/v1/admin/applications/'.$applicationId.'/accept', ['role' => 'volunteer'])
            ->assertCreated();

        $userId = $response->json('data.user_id');
        $this->assertSame(2, Consent::where('user_id', $userId)->count());
        $this->assertDatabaseHas('consents', [
            'user_id' => $userId,
            'type' => 'regulamin',
        ]);
        $this->assertDatabaseHas('consents', [
            'user_id' => $userId,
            'type' => 'polityka',
        ]);
        $this->assertSame(
            $regulamin->toDateTimeString(),
            Consent::where('user_id', $userId)->where('type', 'regulamin')->value('granted_at')
        );
    }

    public function test_manual_entry_with_a_future_consent_date_is_rejected(): void
    {
        Edition::factory()->create(['status' => 'active']);
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $this->postJson('/api/v1/admin/applications', [
            'first_name' => 'Zbyt',
            'last_name' => 'Wczesnie',
            'email' => 'zbyt.wczesnie@example.test',
            'role' => 'volunteer',
            'consent_regulamin_at' => now()->addDay()->toIso8601String(),
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['consent_regulamin_at']]]);
    }

    public function test_csv_import_skips_a_row_with_a_future_consent_date(): void
    {
        Edition::factory()->create(['status' => 'active']);
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');
        $future = now()->addDay()->format('Y-m-d');

        $csv = UploadedFile::fake()->createWithContent('applications.csv', implode("\n", [
            'first_name,last_name,email,consent_regulamin_at',
            'Adam,Przyszly,adam.przyszly@example.test,'.$future,
        ]));

        $this->post('/api/v1/admin/applications/import', ['file' => $csv])
            ->assertOk()
            ->assertJsonPath('data.imported', 0)
            ->assertJsonPath('data.skipped.0.reason', 'invalid_consent_date');

        $this->assertDatabaseMissing('applications', ['email' => 'adam.przyszly@example.test']);
    }

    public function test_csv_import_consent_dates_reach_consents_after_acceptance(): void
    {
        $edition = Edition::factory()->create(['status' => 'active']);
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');
        $granted = now()->subWeek()->format('Y-m-d');

        $csv = UploadedFile::fake()->createWithContent('applications.csv', implode("\n", [
            'first_name,last_name,email,consent_regulamin_at,consent_polityka_at',
            'Ewa,Zgodna,ewa.zgodna@example.test,'.$granted.','.$granted,
        ]));

        $this->post('/api/v1/admin/applications/import', ['file' => $csv])
            ->assertOk()
            ->assertJsonPath('data.imported', 1);

        $application = Application::where('email', 'ewa.zgodna@example.test')->firstOrFail();
        $response = $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', ['role' => 'volunteer'])
            ->assertCreated();

        $userId = $response->json('data.user_id');
        $this->assertSame(2, Consent::where('user_id', $userId)->count());
    }

    public function test_rejection_audit_entry_carries_no_reason_key(): void
    {
        Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create();
        $actor = User::factory()->role('project_manager')->create();
        $this->actingAs($actor, 'keycloak');

        $this->postJson('/api/v1/admin/applications/'.$application->id.'/reject', ['reason' => 'Niepelne dane osobowe.'])
            ->assertOk();

        $entry = AuditLogEntry::where('action', 'application.rejected')
            ->where('subject_id', $application->id)
            ->firstOrFail();

        $details = (array) $entry->details;
        $this->assertSame('rejected', $details['decision']);
        $this->assertArrayNotHasKey('reason', $details);
        $this->assertSame('Niepelne dane osobowe.', $application->fresh()->rejection_reason);
    }

    public function test_second_acceptance_of_the_same_application_is_refused_and_only_one_mail_was_sent(): void
    {
        Mail::shouldReceive('raw')->once();

        Edition::factory()->create(['status' => 'active']);
        $application = Application::factory()->create();
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', ['role' => 'volunteer'])
            ->assertCreated();
        $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', ['role' => 'volunteer'])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'application_already_decided');
    }
}
