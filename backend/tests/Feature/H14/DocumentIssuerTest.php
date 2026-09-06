<?php

namespace Tests\Feature\H14;

use App\Exceptions\ApiException;
use App\Models\AuditLogEntry;
use App\Models\Document;
use App\Models\Edition;
use App\Models\InternshipEntry;
use App\Models\Notification;
use App\Models\User;
use App\Services\H14\DocumentIssuer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DocumentIssuerTest extends TestCase
{
    use RefreshDatabase;

    private Edition $edition;

    protected function setUp(): void
    {
        parent::setUp();

        $this->edition = Edition::create([
            'name' => 'Edycja testowa',
            'starts_at' => '2026-10-01',
            'ends_at' => '2027-09-30',
            'seats_limit' => 40,
            'test_pass_threshold' => 80,
            'test_attempts_limit' => 3,
            'internship_hours_required' => 72,
            'supervision_required_count' => 6,
            'reliability_threshold' => 60,
            'lesson_completion_percent' => 60,
            'status' => 'active',
        ]);
    }

    private function completeUser(array $overrides = []): User
    {
        return User::factory()->create(array_merge([
            'edition_id' => $this->edition->id,
            'first_name' => 'Test',
            'last_name' => 'Testowa',
            'phone' => '+48 600 000 000',
            'pesel' => '90010112345',
            'address_street' => 'ul. Testowa 1',
            'address_city' => 'Warszawa',
            'address_zip' => '00-001',
        ], $overrides));
    }

    public function test_the_next_document_gets_the_next_number(): void
    {
        $first = DocumentIssuer::issue($this->completeUser(), 'volunteer_agreement');
        $second = DocumentIssuer::issue($this->completeUser(), 'volunteer_agreement');

        $this->assertSame('PW/2026/001', $first->number);
        $this->assertSame('PW/2026/002', $second->number);
    }

    public function test_type_sequences_are_independent(): void
    {
        DocumentIssuer::issue($this->completeUser(), 'volunteer_agreement');
        DocumentIssuer::issue($this->completeUser(), 'volunteer_agreement');
        DocumentIssuer::issue($this->completeUser(), 'volunteer_agreement');

        $user = $this->completeUser();
        InternshipEntry::create([
            'user_id' => $user->id,
            'date' => now()->subDays(10)->toDateString(),
            'hours' => '72',
            'form' => 'phone_duty',
            'consultations_count' => 20,
            'description' => 'Dyżur.',
            'status' => 'accepted',
        ]);

        $certificate = DocumentIssuer::issue($user, 'internship_certificate');

        $this->assertSame('ZS/2026/001', $certificate->number);
    }

    public function test_the_number_year_comes_from_the_edition_not_now(): void
    {
        // A year deliberately different from "today" — proves the number is
        // taken from edition.starts_at, not now(), whatever the test runs on.
        $farFutureEdition = Edition::create([
            'name' => 'Edycja odległa',
            'starts_at' => '2031-01-15',
            'ends_at' => '2031-12-31',
            'seats_limit' => 40,
            'test_pass_threshold' => 80,
            'test_attempts_limit' => 3,
            'internship_hours_required' => 72,
            'supervision_required_count' => 6,
            'reliability_threshold' => 60,
            'lesson_completion_percent' => 60,
            'status' => 'active',
        ]);
        // Only one edition may be active at a time (Settings::activeEdition — §3.3).
        $this->edition->update(['status' => 'closed']);

        $document = DocumentIssuer::issue(
            $this->completeUser(['edition_id' => $farFutureEdition->id]),
            'volunteer_agreement',
        );

        $this->assertSame('PW/2031/001', $document->number);
    }

    public function test_successful_issuance_creates_a_notification_and_an_audit_entry(): void
    {
        $user = $this->completeUser();

        $document = DocumentIssuer::issue($user, 'volunteer_agreement');

        $this->assertDatabaseHas('notifications', [
            'user_id' => $user->id,
            'type' => 'document.ready',
            'link' => '/panel/dokumenty',
        ]);

        $this->assertDatabaseHas('audit_log', [
            'actor_id' => $user->id,
            'action' => 'document.generated',
            'subject_id' => $document->id,
        ]);
    }

    public function test_profile_incomplete_denial_leaves_no_trace(): void
    {
        $user = $this->completeUser(['pesel' => null]);

        try {
            DocumentIssuer::issue($user, 'volunteer_agreement');
            $this->fail('Expected ApiException.');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->status);
            $this->assertSame('profile_incomplete', $e->errorCode);
        }

        $this->assertSame(0, Document::count());
        $this->assertSame(0, Notification::where('user_id', $user->id)->count());
        $this->assertSame(0, AuditLogEntry::where('actor_id', $user->id)->count());
    }

    public function test_conditions_not_met_denial_leaves_no_trace(): void
    {
        $user = $this->completeUser();

        try {
            DocumentIssuer::issue($user, 'internship_certificate');
            $this->fail('Expected ApiException.');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->status);
            $this->assertSame('conditions_not_met', $e->errorCode);
        }

        $this->assertSame(0, Document::count());
        $this->assertSame(0, Notification::where('user_id', $user->id)->count());
    }

    public function test_duplicate_denial_leaves_no_trace(): void
    {
        $user = $this->completeUser();
        DocumentIssuer::issue($user, 'volunteer_agreement');

        try {
            DocumentIssuer::issue($user, 'volunteer_agreement');
            $this->fail('Expected ApiException.');
        } catch (ApiException $e) {
            $this->assertSame(409, $e->status);
            $this->assertSame(DocumentIssuer::DUPLICATE_CODE, $e->errorCode);
        }

        $this->assertSame(1, Document::where('user_id', $user->id)->count());
        $this->assertSame(1, Notification::where('user_id', $user->id)->count());
    }

    public function test_changing_the_profile_after_issuance_does_not_change_the_snapshot(): void
    {
        $user = $this->completeUser();
        $document = DocumentIssuer::issue($user, 'volunteer_agreement');
        $originalSnapshot = $document->fresh()->data_snapshot;

        $user->forceFill([
            'address_city' => 'Zupełnie inne miasto',
            'phone' => '+48 111 222 333',
        ])->save();

        $this->assertSame($originalSnapshot, $document->fresh()->data_snapshot);
        $this->assertSame('Warszawa', $document->fresh()->data_snapshot['address_city']);
    }
}
