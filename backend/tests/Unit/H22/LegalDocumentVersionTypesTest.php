<?php

namespace Tests\Unit\H22;

use App\Models\Application;
use App\Models\LegalDocumentVersion;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * `LegalDocumentVersion::TYPES` musi używać dokładnie tego samego słownika
 * rodzajów co ustalone `consents.type` (`Application::CONSENT_COLUMNS`,
 * H01/H03/DemoSeeder) — to ten sam rodzaj zgody widziany z dwóch stron
 * (dokument prawny vs zgoda uczestnika). Rozjazd nazw nie psuje żadnego
 * zapytania SQL (kolumna `type` jest wolnym tekstem), ale psuje ekran:
 * `CONSENT_LABELS` w panelu profilu (`frontend/app/(uczestnik)/panel/profil/page.tsx`)
 * zna tylko rodzaje ze słownika `consents` i dla nieznanego klucza pokazuje
 * surową nazwę techniczną zamiast tytułu (`CONSENT_LABELS[consent.type] ?? consent.type`).
 *
 * Test nie dotyka bazy danych (same stałe PHP) — nie potrzebuje własnego
 * świata do ustawienia ani sprzątania. Bez cechy bazodanowej runner równoległy
 * zostawiłby go na bazie WSPÓLNEJ (`TestDatabases.php:56`), więc trafia do grupy
 * `wspolna-baza` — tak samo jak inne klasy bez tej cechy (`GrupaWspolnejBazyTest`).
 */
#[Group('wspolna-baza')]
class LegalDocumentVersionTypesTest extends TestCase
{
    public function test_every_legal_document_type_is_a_known_consent_type(): void
    {
        $knownConsentTypes = array_keys(Application::CONSENT_COLUMNS);

        foreach (LegalDocumentVersion::TYPES as $type) {
            $this->assertContains(
                $type,
                $knownConsentTypes,
                "Rodzaj dokumentu prawnego '{$type}' nie jest znanym rodzajem zgody (consents.type)."
            );
        }
    }
}
