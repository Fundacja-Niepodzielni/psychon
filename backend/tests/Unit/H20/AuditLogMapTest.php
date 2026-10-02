<?php

namespace Tests\Unit\H20;

use App\Http\Requests\H20\AuditIndexRequest;
use App\Services\H20\AuditLogMap;
use PHPUnit\Framework\TestCase;

/**
 * Słownik grup i zdań dziennika działań (`AuditLogMap`). Każdy kod z rejestru
 * (`AuditIndexRequest::ACTIONS`, którego pełność wobec kodu produkcyjnego
 * pilnuje `AuditLogSlugRegistryTest`) ma DOKŁADNIE jedną grupę i jedno zdanie;
 * słownik nie zna kodu spoza rejestru. Zdanie zaczyna się czynnością z
 * zamkniętej listy i nie niesie wartości (cyfr, znaków zastępczych).
 *
 * Bez bazy i bez aplikacji — czysty odczyt stałych.
 */
final class AuditLogMapTest extends TestCase
{
    public function test_every_registered_code_has_exactly_one_group_and_the_map_knows_no_other_code(): void
    {
        $registered = AuditIndexRequest::ACTIONS;
        $mapped = array_keys(AuditLogMap::EVENTS);

        self::assertSame([], self::missing($registered, AuditLogMap::EVENTS), 'Kod z rejestru bez grupy i zdania.');
        self::assertSame([], array_values(array_diff($mapped, $registered)), 'Słownik zna kod spoza rejestru.');
        self::assertCount(34, $registered, 'Rejestr zmienił liczbę kodów — dopisz grupę i zdanie nowemu kodowi.');

        foreach (AuditLogMap::EVENTS as $code => [$group]) {
            self::assertArrayHasKey($group, AuditLogMap::GROUPS, "Kod {$code} wskazuje nieznaną grupę.");
            self::assertSame($group, AuditLogMap::group($code));
        }
    }

    public function test_control_a_code_without_an_entry_is_reported_as_missing(): void
    {
        $withoutOne = AuditLogMap::EVENTS;
        unset($withoutOne['internship.accepted']);

        self::assertSame(['internship.accepted'], self::missing(AuditIndexRequest::ACTIONS, $withoutOne));
    }

    public function test_groups_are_the_seven_named_groups_and_every_group_has_codes(): void
    {
        self::assertSame(
            ['Konta i role', 'Nabór', 'Kursy i testy', 'Staż i dyżury', 'Superwizja', 'Dokumenty i certyfikaty', 'Inne'],
            array_values(AuditLogMap::GROUPS),
        );

        $all = [];
        foreach (array_keys(AuditLogMap::GROUPS) as $group) {
            $codes = AuditLogMap::actionsIn($group);
            self::assertNotSame([], $codes, "Grupa {$group} nie ma żadnego kodu.");
            $all = [...$all, ...$codes];
        }

        // Grupy dzielą rejestr bez reszty i bez powtórzeń.
        sort($all);
        $registered = AuditIndexRequest::ACTIONS;
        sort($registered);
        self::assertSame($registered, $all);
    }

    public function test_every_sentence_starts_with_an_action_from_the_closed_list_and_carries_no_value(): void
    {
        foreach (AuditLogMap::EVENTS as $code => [, $sentence]) {
            $first = explode(' ', $sentence)[0];
            self::assertContains($first, AuditLogMap::CZYNNOSCI, "Zdanie kodu {$code} zaczyna się czynnością spoza listy: {$sentence}");
            self::assertDoesNotMatchRegularExpression('/[0-9{}%:;"]/u', $sentence, "Zdanie kodu {$code} niesie wartość: {$sentence}");
            self::assertSame($sentence, AuditLogMap::sentence($code));
        }
    }

    public function test_examples_from_the_screen_description(): void
    {
        self::assertSame('Zatwierdzono dyżur', AuditLogMap::sentence('internship.accepted'));
        self::assertSame('Wydano certyfikat', AuditLogMap::sentence('certificate.issued'));
        self::assertSame('Staż i dyżury', AuditLogMap::groupLabel('internship.accepted'));
        self::assertSame('Konta i role', AuditLogMap::groupLabel('user.blocked'));
    }

    public function test_owner_sql_names_every_owned_subject_type_once(): void
    {
        [$sql, $bindings] = AuditLogMap::ownerSql();

        self::assertSame(count($bindings), substr_count($sql, 'WHEN ?'));
        self::assertSame(count($bindings), count(array_unique($bindings)));
        foreach (array_keys(AuditLogMap::OWNED) as $type) {
            self::assertContains($type, $bindings);
        }
        self::assertStringNotContainsString('\\', $sql, 'Nazwy klas idą wiązaniami, nie tekstem zapytania.');
    }

    /**
     * Kody z rejestru, których słownik nie zna.
     *
     * @param  list<string>  $registered
     * @param  array<string, mixed>  $events
     * @return list<string>
     */
    private static function missing(array $registered, array $events): array
    {
        return array_values(array_diff($registered, array_keys($events)));
    }
}
