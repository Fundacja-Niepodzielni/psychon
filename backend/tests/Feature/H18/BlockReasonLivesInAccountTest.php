<?php

namespace Tests\Feature\H18;

use App\Models\AuditLogEntry;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Powód blokady konta jest tekstem wpisanym przez administrację. Żyje w koncie
 * (`users.blocked_reason`): widać go na karcie osoby w panelu administracji,
 * znika przy odblokowaniu i przy anonimizacji. Rejestr zdarzeń niesie poprzedni
 * stan konta, a jego lista, eksport i wpisy na karcie — bez treści powodu.
 */
class BlockReasonLivesInAccountTest extends TestCase
{
    use RefreshDatabase;

    private const string MARKER = 'ZNACZNIK-BLOKADY-2e84d0b6';

    private User $person;

    protected function setUp(): void
    {
        parent::setUp();

        $this->person = User::factory()->create(['role' => 'volunteer']);
    }

    private function staff(string $role): User
    {
        return User::factory()->create(['role' => $role]);
    }

    private function block(): void
    {
        $this->postJson("/api/v1/admin/users/{$this->person->id}/block", [
            'reason' => 'Powód wpisany ręcznie: '.self::MARKER,
        ])->assertOk();
    }

    private function auditRowJson(string $action): string
    {
        $entry = AuditLogEntry::query()->where('action', $action)->where('subject_id', $this->person->id)->firstOrFail();

        return json_encode($entry->getAttributes(), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    public function test_the_reason_is_stored_in_the_account_and_shown_on_the_card_to_administration(): void
    {
        $this->actingAs($this->staff('project_manager'), 'keycloak');

        $this->block();

        $this->assertStringContainsString(self::MARKER, (string) $this->person->fresh()->blocked_reason);

        $card = $this->getJson("/api/v1/admin/users/{$this->person->id}")->assertOk();
        $this->assertSame('blocked', $card->json('data.account.status'));
        $this->assertStringContainsString(self::MARKER, (string) $card->json('data.account.blocked_reason'));
    }

    public function test_the_audit_entry_carries_the_previous_status_and_no_text(): void
    {
        $this->actingAs($this->staff('super_admin'), 'keycloak');

        $this->block();

        $entry = AuditLogEntry::query()->where('action', 'user.blocked')->where('subject_id', $this->person->id)->firstOrFail();
        $this->assertSame(['previous_status' => 'active'], $entry->details);
        $this->assertStringNotContainsString(self::MARKER, $this->auditRowJson('user.blocked'));
    }

    public function test_the_audit_list_export_and_card_entries_do_not_carry_the_reason(): void
    {
        $this->actingAs($this->staff('super_admin'), 'keycloak');
        $this->block();

        $list = $this->getJson('/api/v1/admin/audit?action=user.blocked')->assertOk();
        $this->assertStringNotContainsString(self::MARKER, $list->getContent());
        $this->assertSame(['previous_status' => 'active'], $list->json('data.0.details'));

        $this->assertStringNotContainsString(self::MARKER, $this->get('/api/v1/admin/audit/export.csv')->streamedContent());

        $entries = $this->getJson("/api/v1/admin/users/{$this->person->id}")->assertOk()->json('data.audit_entries');
        $this->assertStringNotContainsString(self::MARKER, json_encode($entries, JSON_UNESCAPED_UNICODE));
    }

    public function test_unblocking_clears_the_reason(): void
    {
        $this->actingAs($this->staff('project_manager'), 'keycloak');
        $this->block();

        $answer = $this->postJson("/api/v1/admin/users/{$this->person->id}/unblock")->assertOk();

        $this->assertNull($this->person->fresh()->blocked_reason);
        $this->assertNull($answer->json('data.account.blocked_reason'));
        $this->assertStringNotContainsString(self::MARKER, $answer->getContent());
        $this->assertStringNotContainsString(self::MARKER, $this->auditRowJson('user.unblocked'));
    }

    public function test_anonymising_a_blocked_person_removes_the_reason_everywhere_it_could_be_read(): void
    {
        $this->actingAs($this->staff('super_admin'), 'keycloak');
        $this->block();
        $this->assertNotNull($this->person->fresh()->blocked_reason);

        $this->postJson("/api/v1/admin/users/{$this->person->id}/anonymize")->assertOk();

        $after = $this->person->fresh();
        $this->assertNull($after->blocked_reason, 'powód blokady zostaje w koncie po anonimizacji');
        $this->assertSame('deleted', $after->status);

        $card = $this->getJson("/api/v1/admin/users/{$this->person->id}")->assertOk();
        $this->assertNull($card->json('data.account.blocked_reason'));
        $this->assertStringNotContainsString(self::MARKER, $card->getContent());
        $this->assertStringNotContainsString(self::MARKER, $this->auditRowJson('user.blocked'));
        $this->assertStringNotContainsString(self::MARKER, $this->getJson('/api/v1/admin/audit')->assertOk()->getContent());
        $this->assertStringNotContainsString(self::MARKER, $this->get('/api/v1/admin/audit/export.csv')->streamedContent());
    }

    public function test_a_lecturer_gets_403_without_the_reason_on_the_card_and_on_blocking(): void
    {
        $this->actingAs($this->staff('project_manager'), 'keycloak');
        $this->block();

        $this->actingAs($this->staff('instructor'), 'keycloak');

        $card = $this->getJson("/api/v1/admin/users/{$this->person->id}");
        $card->assertStatus(403);
        $this->assertStringNotContainsString(self::MARKER, $card->getContent());

        $other = $this->postJson("/api/v1/admin/users/{$this->person->id}/block", ['reason' => 'Powód: '.self::MARKER]);
        $other->assertStatus(403);
        $this->assertStringNotContainsString(self::MARKER, $other->getContent());
    }

    public function test_the_model_serialisation_does_not_carry_the_reason(): void
    {
        $this->person->forceFill(['blocked_reason' => 'Powód wpisany ręcznie: '.self::MARKER])->save();
        $person = $this->person->fresh();
        $this->assertStringContainsString(self::MARKER, (string) $person->blocked_reason);

        $this->assertArrayNotHasKey('blocked_reason', $person->toArray());

        $json = $person->toJson(JSON_UNESCAPED_UNICODE);
        $this->assertArrayNotHasKey('blocked_reason', json_decode($json, true, 512, JSON_THROW_ON_ERROR));
        $this->assertStringNotContainsString(self::MARKER, $json);
    }

    public function test_the_person_cannot_read_their_own_reason_from_their_profile(): void
    {
        $this->actingAs($this->staff('project_manager'), 'keycloak');
        $this->block();

        $this->person->forceFill(['status' => 'active'])->save();
        $this->person->forceFill(['blocked_reason' => 'Powód wpisany ręcznie: '.self::MARKER])->save();
        $this->actingAs($this->person->fresh(), 'keycloak');

        $response = $this->getJson('/api/v1/me')->assertOk();

        $this->assertStringNotContainsString(self::MARKER, $response->getContent());
    }
}
