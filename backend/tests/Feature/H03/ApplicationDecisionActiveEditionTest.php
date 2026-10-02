<?php

namespace Tests\Feature\H03;

use App\Models\Application;
use App\Models\AuditLogEntry;
use App\Models\Edition;
use App\Models\EmailMessage;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Akceptacja i odrzucenie działają wyłącznie w aktywnej edycji. Zgłoszenie
 * innej edycji (zamkniętej, szkicu albo starszej) daje to samo 404 co
 * zgłoszenie nieistniejące i co podgląd (`show`) — bez zapisu, bez audytu,
 * bez powiadomienia, bez konta i bez wiadomości e-mail.
 */
class ApplicationDecisionActiveEditionTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{0: Edition, 1: array<string, Application>}
     */
    private function editions(): array
    {
        $older = Edition::factory()->create(['status' => 'active']);
        $closed = Edition::factory()->create(['status' => 'closed']);
        $draft = Edition::factory()->create(['status' => 'draft']);
        // Aktywna jest najnowsza edycja w stanie `active` (`Settings::activeEdition`).
        $active = Edition::factory()->create(['status' => 'active']);

        return [$active, [
            'starsza aktywna' => Application::factory()->create(['edition_id' => $older->id]),
            'zamknięta' => Application::factory()->create(['edition_id' => $closed->id]),
            'szkic' => Application::factory()->create(['edition_id' => $draft->id]),
        ]];
    }

    private function nothingHappened(): void
    {
        $this->assertSame(0, EmailMessage::query()->count());
        $this->assertSame(0, AuditLogEntry::query()->count());
        $this->assertSame(0, Notification::query()->count());
    }

    public function test_decisions_on_another_edition_are_the_same_404_as_a_missing_application(): void
    {
        Mail::shouldReceive('raw')->never();
        [, $others] = $this->editions();
        $usersBefore = User::query()->count();
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');
        $usersBefore++;

        $missingAccept = $this->postJson('/api/v1/admin/applications/999999/accept', ['role' => 'volunteer'])
            ->assertNotFound()->json();
        $missingReject = $this->postJson('/api/v1/admin/applications/999999/reject', ['reason' => 'Brak dyplomu.'])
            ->assertNotFound()->json();
        $missingShow = $this->getJson('/api/v1/admin/applications/999999')->assertNotFound()->json();

        $this->assertSame('not_found', $missingAccept['error']['code']);
        $this->assertSame($missingShow, $missingAccept);
        $this->assertSame($missingShow, $missingReject);

        foreach ($others as $label => $application) {
            $this->assertSame(
                $missingShow,
                $this->getJson('/api/v1/admin/applications/'.$application->id)->assertNotFound()->json(),
                $label,
            );
            $this->assertSame(
                $missingAccept,
                $this->postJson('/api/v1/admin/applications/'.$application->id.'/accept', ['role' => 'volunteer', 'force' => true])
                    ->assertNotFound()->json(),
                $label,
            );
            $this->assertSame(
                $missingReject,
                $this->postJson('/api/v1/admin/applications/'.$application->id.'/reject', ['reason' => 'Brak dyplomu.'])
                    ->assertNotFound()->json(),
                $label,
            );

            $fresh = $application->fresh();
            $this->assertSame('new', $fresh->status, $label);
            $this->assertNull($fresh->decided_by, $label);
            $this->assertNull($fresh->rejection_reason, $label);
            $this->assertNull($fresh->user_id, $label);
        }

        $this->nothingHappened();
        $this->assertSame($usersBefore, User::query()->count());
    }

    public function test_the_active_edition_keeps_its_decisions(): void
    {
        Mail::shouldReceive('raw')->twice();
        [$active] = $this->editions();
        $toAccept = Application::factory()->create(['edition_id' => $active->id]);
        $toReject = Application::factory()->create(['edition_id' => $active->id]);
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $this->postJson('/api/v1/admin/applications/'.$toAccept->id.'/accept', ['role' => 'volunteer'])
            ->assertCreated()
            ->assertJsonPath('data.invitation_mail', 'sent');
        $this->postJson('/api/v1/admin/applications/'.$toReject->id.'/reject', ['reason' => 'Brak dyplomu.'])
            ->assertOk()
            ->assertJsonPath('data.rejection_mail', 'sent');

        $this->assertSame('accepted', $toAccept->fresh()->status);
        $this->assertSame('rejected', $toReject->fresh()->status);
    }
}
