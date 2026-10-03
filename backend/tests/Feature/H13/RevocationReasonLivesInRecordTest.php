<?php

namespace Tests\Feature\H13;

use App\Models\AuditLogEntry;
use App\Models\Certificate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * Powód unieważnienia certyfikatu jest tekstem wpisanym przez administrację.
 * Żyje w jednym miejscu — w rekordzie certyfikatu (`certificates.revoked_reason`) —
 * i znika razem z anonimizacją konta właściciela. Dziennik zdarzeń niesie numer
 * certyfikatu, nigdy treść powodu; lista dziennika i jego eksport też jej nie
 * pokazują. Lista certyfikatów pokazuje powód wyłącznie administracji.
 */
class RevocationReasonLivesInRecordTest extends CertificatePackageCase
{
    use RefreshDatabase;

    private const string MARKER = 'ZNACZNIK-POWODU-7f3a91c2';

    private function admin(): User
    {
        return User::where('email', 'admin@demo.pl')->firstOrFail();
    }

    private function revokeOlasCertificate(): Certificate
    {
        $certificate = Certificate::where('user_id', $this->ola()->id)->firstOrFail();

        $this->actingAs($this->admin(), 'keycloak');
        $this->postJson("/api/v1/admin/certificates/{$certificate->id}/revoke", [
            'reason' => 'Powód wpisany ręcznie: '.self::MARKER,
        ])->assertOk();

        return $certificate->fresh();
    }

    private function wholeAuditRowFor(Certificate $certificate): string
    {
        $entry = AuditLogEntry::query()
            ->where('action', 'certificate.revoked')
            ->where('subject_id', $certificate->id)
            ->firstOrFail();

        return json_encode($entry->getAttributes(), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    public function test_the_reason_is_stored_in_the_certificate_record(): void
    {
        $certificate = $this->revokeOlasCertificate();

        $this->assertStringContainsString(self::MARKER, (string) $certificate->revoked_reason);
        $this->assertNotNull($certificate->revoked_at);
    }

    public function test_the_audit_entry_carries_the_number_and_no_reason(): void
    {
        $certificate = $this->revokeOlasCertificate();

        $entry = AuditLogEntry::query()
            ->where('action', 'certificate.revoked')
            ->where('subject_id', $certificate->id)
            ->firstOrFail();

        $this->assertSame(['number' => $certificate->number], $entry->details);
        $this->assertStringNotContainsString(self::MARKER, $this->wholeAuditRowFor($certificate));
    }

    public function test_the_certificate_list_and_the_revoke_answer_show_the_reason_to_administration(): void
    {
        $this->actingAs($this->admin(), 'keycloak');
        $certificate = Certificate::where('user_id', $this->ola()->id)->firstOrFail();

        $revoke = $this->postJson("/api/v1/admin/certificates/{$certificate->id}/revoke", [
            'reason' => 'Powód wpisany ręcznie: '.self::MARKER,
        ])->assertOk();

        $this->assertStringContainsString(self::MARKER, (string) $revoke->json('data.revoked_reason'));

        $list = $this->getJson('/api/v1/admin/certificates')->assertOk();

        $row = collect($list->json('data'))->firstWhere('id', $certificate->id);
        $this->assertSame('revoked', $row['status']);
        $this->assertStringContainsString(self::MARKER, (string) $row['revoked_reason']);
    }

    public function test_a_lecturer_cannot_read_the_certificate_list_with_the_reason(): void
    {
        $this->actingAs($this->admin(), 'keycloak');
        $certificate = Certificate::where('user_id', $this->ola()->id)->firstOrFail();
        $this->postJson("/api/v1/admin/certificates/{$certificate->id}/revoke", [
            'reason' => 'Powód wpisany ręcznie: '.self::MARKER,
        ])->assertOk();

        $lecturer = User::where('email', 'joanna@demo.pl')->firstOrFail();
        $this->assertSame('instructor', $lecturer->role);
        $this->actingAs($lecturer, 'keycloak');

        $response = $this->getJson('/api/v1/admin/certificates');

        $response->assertStatus(403);
        $this->assertStringNotContainsString(self::MARKER, $response->getContent());
    }

    public function test_the_audit_list_and_its_export_do_not_carry_the_reason(): void
    {
        $this->revokeOlasCertificate();

        $list = $this->getJson('/api/v1/admin/audit?action=certificate.revoked')->assertOk();
        $this->assertStringNotContainsString(self::MARKER, $list->getContent());

        $csv = $this->get('/api/v1/admin/audit/export.csv?action=certificate.revoked');
        $csv->assertOk();
        $this->assertStringNotContainsString(self::MARKER, $csv->streamedContent());
    }

    public function test_anonymising_the_owner_removes_the_reason_everywhere_it_could_be_read(): void
    {
        $certificate = $this->revokeOlasCertificate();
        $this->assertStringContainsString(self::MARKER, (string) $certificate->revoked_reason);

        $this->postJson("/api/v1/admin/users/{$this->ola()->id}/anonymize")->assertOk();

        $after = Certificate::findOrFail($certificate->id);
        $this->assertNull($after->revoked_reason, 'powód zostaje w rekordzie certyfikatu po anonimizacji');
        $this->assertNotNull($after->revoked_at, 'sam fakt unieważnienia zostaje');
        $this->assertSame($certificate->number, $after->number);

        $this->assertStringNotContainsString(self::MARKER, $this->wholeAuditRowFor($after));

        $this->assertStringNotContainsString(
            self::MARKER,
            $this->getJson('/api/v1/admin/audit')->assertOk()->getContent(),
        );
        $this->assertStringNotContainsString(
            self::MARKER,
            $this->get('/api/v1/admin/audit/export.csv')->streamedContent(),
        );
        $list = $this->getJson('/api/v1/admin/certificates')->assertOk();
        $this->assertStringNotContainsString(self::MARKER, $list->getContent());
        $this->assertNull(collect($list->json('data'))->firstWhere('id', $certificate->id)['revoked_reason']);
    }
}
