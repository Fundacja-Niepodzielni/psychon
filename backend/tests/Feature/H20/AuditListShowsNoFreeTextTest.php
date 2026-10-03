<?php

namespace Tests\Feature\H20;

use App\Models\User;
use App\Support\AuditDetailsView;
use App\Support\AuditLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Dziennik działań (`GET /admin/audit` i `GET /admin/audit/export.csv`)
 * pokazuje identyfikatory, kody i flagi. Pola z treścią wpisaną ręcznie
 * (powód, komentarz, notatka, odpowiedź) nie są w nim wyświetlane, także
 * w starszych wpisach — treść żyje w rekordzie dziedzinowym.
 */
class AuditListShowsNoFreeTextTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const string MARKER = 'ZNACZNIK-TRESCI-b41d08e5';

    public function test_list_hides_text_fields_and_keeps_identifiers_and_codes(): void
    {
        $admin = $this->actingAsRole('super_admin');
        $person = User::factory()->create(['role' => 'volunteer']);

        AuditLog::record($admin, 'attempts.reset', $person, [
            'test_id' => 7,
            'reason' => self::MARKER,
            'cleared' => 3,
        ]);

        $response = $this->getJson('/api/v1/admin/audit?action=attempts.reset')->assertOk();

        $this->assertSame(['test_id' => 7, 'cleared' => 3], $response->json('data.0.details'));
        $this->assertStringNotContainsString(self::MARKER, $response->getContent());
    }

    public function test_nested_text_fields_are_hidden_too_and_an_empty_payload_becomes_null(): void
    {
        $admin = $this->actingAsRole('super_admin');
        $person = User::factory()->create(['role' => 'volunteer']);

        AuditLog::record($admin, 'user.blocked', $person, ['reason' => self::MARKER]);
        AuditLog::record($admin, 'user.updated', $person, [
            'changed' => ['phone'],
            'extra' => ['comment' => self::MARKER, 'note' => self::MARKER, 'ids' => [1, 2]],
        ]);

        $response = $this->getJson('/api/v1/admin/audit')->assertOk();

        $byAction = collect($response->json('data'))->keyBy('action');
        $this->assertNull($byAction['user.blocked']['details']);
        $this->assertSame(
            ['changed' => ['phone'], 'extra' => ['ids' => [1, 2]]],
            $byAction['user.updated']['details'],
        );
        $this->assertStringNotContainsString(self::MARKER, $response->getContent());
    }

    /**
     * Zbiór nazw jest wypisany tu wprost, nie czytany z kodu: usunięcie
     * którejkolwiek jednej nazwy z listy w kodzie zostawia pole z tą nazwą
     * widoczne i musi zaczerwienić dokładnie próbę tej nazwy.
     *
     * @return array<string, array{string}>
     */
    public static function textFieldNames(): array
    {
        return [
            'reason' => ['reason'],
            'comment' => ['comment'],
            'note' => ['note'],
            'notes' => ['notes'],
            'response' => ['response'],
            'description' => ['description'],
            'message' => ['message'],
        ];
    }

    #[DataProvider('textFieldNames')]
    public function test_each_text_field_name_is_absent_from_list_export_and_card(string $name): void
    {
        $marker = 'ZNACZNIK-POLA-'.$name.'-7a3c91e0';
        $admin = $this->actingAsRole('super_admin');
        $person = User::factory()->create(['role' => 'volunteer']);

        AuditLog::record($admin, 'user.updated', $person, [
            'changed' => ['phone'],
            $name => $marker,
            'extra' => [$name => $marker, 'ids' => [1, 2]],
        ]);

        $list = $this->getJson('/api/v1/admin/audit?action=user.updated')->assertOk();
        $this->assertStringNotContainsString($marker, $list->getContent(), "lista pokazuje pole „{$name}”");
        $this->assertSame(
            ['changed' => ['phone'], 'extra' => ['ids' => [1, 2]]],
            $list->json('data.0.details'),
        );

        $csv = $this->get('/api/v1/admin/audit/export.csv?action=user.updated');
        $csv->assertOk();
        $body = $csv->streamedContent();
        $this->assertStringNotContainsString($marker, $body, "eksport pokazuje pole „{$name}”");
        $this->assertStringContainsString('changed', $body);

        $card = $this->getJson("/api/v1/admin/users/{$person->id}")->assertOk();
        $this->assertStringNotContainsString($marker, $card->getContent(), "karta osoby pokazuje pole „{$name}”");
        $this->assertSame(
            ['changed' => ['phone'], 'extra' => ['ids' => [1, 2]]],
            collect($card->json('data.audit_entries'))->firstWhere('action', 'user.updated')['details'],
        );
    }

    public function test_the_closed_set_of_text_field_names_has_exactly_the_seven_names(): void
    {
        $this->assertEqualsCanonicalizing(
            ['reason', 'comment', 'note', 'notes', 'response', 'description', 'message'],
            AuditDetailsView::TEXT_FIELDS,
        );
    }

    public function test_export_hides_text_fields_in_the_details_column(): void
    {
        $admin = $this->actingAsRole('super_admin');
        $person = User::factory()->create(['role' => 'volunteer']);

        AuditLog::record($admin, 'attempts.reset', $person, [
            'test_id' => 7,
            'reason' => self::MARKER,
            'cleared' => 3,
        ]);

        $csv = $this->get('/api/v1/admin/audit/export.csv?action=attempts.reset');

        $csv->assertOk();
        $body = $csv->streamedContent();
        $this->assertStringNotContainsString(self::MARKER, $body);
        $this->assertStringContainsString('test_id', $body);
    }
}
