<?php

namespace Tests\Feature\H10;

use App\Models\AuditLogEntry;
use App\Models\Test;
use App\Models\TestAttempt;
use App\Models\TestAttemptReset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * Powód wyzerowania podejść do testu jest tekstem wpisanym przez administrację.
 * Żyje w rekordzie wyzerowania (`test_attempt_resets`) i jest zerowany razem
 * z anonimizacją osoby; rejestr zdarzeń niesie identyfikator testu i liczbę
 * skasowanych podejść. Powód nie wraca w żadnej odpowiedzi.
 */
class ResetReasonLivesInRecordTest extends TestPackageCase
{
    use RefreshDatabase;

    private const string MARKER = 'ZNACZNIK-RESETU-5c19e7a3';

    private function staff(string $role): User
    {
        return User::factory()->create(['role' => $role]);
    }

    /**
     * @return array{0: Test, 1: User}
     */
    private function personWithAttempts(): array
    {
        $test = $this->makeTest(questions: 3);
        $person = $this->volunteer();

        foreach ([1, 2] as $number) {
            TestAttempt::create([
                'user_id' => $person->id,
                'test_id' => $test->id,
                'attempt_number' => $number,
                'answers' => [],
                'questions_snapshot' => [],
                'score_percent' => 10,
                'passed' => false,
            ]);
        }

        return [$test, $person];
    }

    private function reset(Test $test, User $person): void
    {
        $this->postJson("/api/v1/admin/tests/{$test->id}/users/{$person->id}/reset-attempts", [
            'reason' => 'Powód wpisany ręcznie: '.self::MARKER,
        ])->assertOk()->assertJsonPath('data.cleared', 2);
    }

    private function auditRowJson(User $person): string
    {
        $entry = AuditLogEntry::query()->where('action', 'attempts.reset')->where('subject_id', $person->id)->firstOrFail();

        return json_encode($entry->getAttributes(), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    public function test_the_reason_is_stored_in_the_reset_record_and_the_audit_entry_carries_no_text(): void
    {
        [$test, $person] = $this->personWithAttempts();
        $admin = $this->staff('project_manager');
        $this->actingAs($admin, 'keycloak');

        $answer = $this->postJson("/api/v1/admin/tests/{$test->id}/users/{$person->id}/reset-attempts", [
            'reason' => 'Powód wpisany ręcznie: '.self::MARKER,
        ])->assertOk();

        $record = TestAttemptReset::query()->where('user_id', $person->id)->firstOrFail();
        $this->assertSame($test->id, $record->test_id);
        $this->assertSame($admin->id, $record->reset_by);
        $this->assertSame(2, $record->cleared);
        $this->assertStringContainsString(self::MARKER, (string) $record->reason);
        $this->assertNotNull($record->created_at);

        $entry = AuditLogEntry::query()->where('action', 'attempts.reset')->where('subject_id', $person->id)->firstOrFail();
        $this->assertSame(['test_id' => $test->id, 'cleared' => 2], $entry->details);
        $this->assertStringNotContainsString(self::MARKER, $this->auditRowJson($person));
        $this->assertStringNotContainsString(self::MARKER, $answer->getContent());
    }

    public function test_a_lecturer_cannot_reset_and_gets_no_reason_back(): void
    {
        [$test, $person] = $this->personWithAttempts();
        $this->actingAs($this->staff('instructor'), 'keycloak');

        $response = $this->postJson("/api/v1/admin/tests/{$test->id}/users/{$person->id}/reset-attempts", [
            'reason' => 'Powód wpisany ręcznie: '.self::MARKER,
        ]);

        $response->assertStatus(403);
        $this->assertStringNotContainsString(self::MARKER, $response->getContent());
        $this->assertSame(0, TestAttemptReset::query()->count());
        $this->assertSame(2, TestAttempt::query()->where('user_id', $person->id)->count());
    }

    public function test_the_audit_list_export_and_person_card_do_not_carry_the_reason(): void
    {
        [$test, $person] = $this->personWithAttempts();
        $this->actingAs($this->staff('super_admin'), 'keycloak');
        $this->reset($test, $person);

        $list = $this->getJson('/api/v1/admin/audit?action=attempts.reset')->assertOk();
        $this->assertStringNotContainsString(self::MARKER, $list->getContent());
        $this->assertSame(['test_id' => $test->id, 'cleared' => 2], $list->json('data.0.details'));

        $this->assertStringNotContainsString(self::MARKER, $this->get('/api/v1/admin/audit/export.csv')->streamedContent());

        $card = $this->getJson("/api/v1/admin/users/{$person->id}")->assertOk();
        $this->assertStringNotContainsString(self::MARKER, $card->getContent());
    }

    public function test_anonymising_the_person_clears_the_reason_but_keeps_the_record(): void
    {
        [$test, $person] = $this->personWithAttempts();
        $this->actingAs($this->staff('super_admin'), 'keycloak');
        $this->reset($test, $person);
        $recordId = TestAttemptReset::query()->where('user_id', $person->id)->value('id');

        $this->postJson("/api/v1/admin/users/{$person->id}/anonymize")->assertOk();

        $record = TestAttemptReset::query()->findOrFail($recordId);
        $this->assertNull($record->reason, 'powód wyzerowania zostaje w rekordzie po anonimizacji');
        $this->assertSame(2, $record->cleared);
        $this->assertSame($test->id, $record->test_id);

        $this->assertStringNotContainsString(self::MARKER, $this->auditRowJson($person));
        $this->assertStringNotContainsString(self::MARKER, $this->getJson('/api/v1/admin/audit')->assertOk()->getContent());
        $this->assertStringNotContainsString(self::MARKER, $this->get('/api/v1/admin/audit/export.csv')->streamedContent());
        $this->assertStringNotContainsString(self::MARKER, $this->getJson("/api/v1/admin/users/{$person->id}")->assertOk()->getContent());
    }
}
