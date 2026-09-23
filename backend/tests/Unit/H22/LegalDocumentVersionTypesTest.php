<?php

namespace Tests\Unit\H22;

use App\Models\Application;
use App\Models\LegalDocumentVersion;
use PHPUnit\Framework\AssertionFailedError;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * `LegalDocumentVersion::TYPES` musi się dzielić, bez reszty i bez
 * nakładania, na dwa zbiory: znane rodzaje zgód
 * (`Application::CONSENT_COLUMNS`) i rodzaje informacyjne
 * (`LegalDocumentVersion::INFORMATIONAL_TYPES`). Ta próba pilnuje
 * WYŁĄCZNIE tego podziału słownika — nie pilnuje tego, co API pozwala
 * zrobić z rodzajem informacyjnym.
 *
 * Stan dzisiejszy, zmierzony (nie życzeniowy): `LegalDocumentController::accept()`
 * (`backend/app/Http/Controllers/Api/V1/H22/LegalDocumentController.php:72`)
 * bramkuje rodzaj przeciwko `LegalDocumentVersion::TYPES`, a nie przeciwko
 * zbiorowi zgód. Rodzaj informacyjny (np. `klauzula-rodo`) DA SIĘ dziś
 * zaakceptować przez `POST /legal-documents/{type}/accept` — kontroler
 * tworzy wtedy prawdziwy wiersz `consents` (ten sam plik, linie 107-112),
 * a ekran profilu pokazuje dla niego surową nazwę techniczną
 * (`CONSENT_LABELS[consent.type] ?? consent.type`,
 * `frontend/app/(uczestnik)/panel/profil/page.tsx:422`). To nie jest usterka
 * tej próby ani tej stałej: czy `accept()` ma odmawiać rodzajom
 * informacyjnym, czy właściciel chce dla nich osobnej zgody, jest decyzją
 * właściciela (zmiana kontraktu API), nie tego pliku. Ta próba nie sprawdza
 * zachowania trasy — tylko to, że słownik `TYPES` jest jawnie i w całości
 * sklasyfikowany.
 *
 * Test nie dotyka bazy danych (same stałe PHP) — nie potrzebuje własnego
 * świata do ustawienia ani sprzątania. Bez cechy bazodanowej runner równoległy
 * zostawiłby go na bazie WSPÓLNEJ (`TestDatabases.php:56`), więc trafia do grupy
 * `wspolna-baza` — tak samo jak inne klasy bez tej cechy (`GrupaWspolnejBazyTest`).
 */
#[Group('wspolna-baza')]
class LegalDocumentVersionTypesTest extends TestCase
{
    public function test_every_legal_document_type_belongs_to_exactly_one_set(): void
    {
        $this->assertTypesArePartitioned(
            LegalDocumentVersion::TYPES,
            array_keys(Application::CONSENT_COLUMNS),
            LegalDocumentVersion::INFORMATIONAL_TYPES,
        );
    }

    /**
     * Kontrola negatywna (a): czwarty rodzaj dopisany do `TYPES` bez
     * wpisania go do żadnego ze zbiorów. Leg przechodzi TYLKO wtedy, gdy
     * `assertTypesArePartitioned` faktycznie rzuci `AssertionFailedError`
     * dla tego wejścia — samo istnienie stałych tego nie zaspokoi.
     */
    public function test_control_type_missing_from_both_sets_turns_test_red(): void
    {
        $this->expectException(AssertionFailedError::class);

        $this->assertTypesArePartitioned(
            [...LegalDocumentVersion::TYPES, 'nowy-rodzaj-kontrolny'],
            array_keys(Application::CONSENT_COLUMNS),
            LegalDocumentVersion::INFORMATIONAL_TYPES,
        );
    }

    /**
     * Kontrola negatywna (b): rodzaj wpisany do OBU zbiorów naraz (tu:
     * znany rodzaj zgody dopisany też do rodzajów informacyjnych). Leg
     * przechodzi TYLKO wtedy, gdy `assertTypesArePartitioned` rzuci
     * `AssertionFailedError` dla tego wejścia.
     */
    public function test_control_type_in_both_sets_turns_test_red(): void
    {
        $this->expectException(AssertionFailedError::class);

        $this->assertTypesArePartitioned(
            LegalDocumentVersion::TYPES,
            array_keys(Application::CONSENT_COLUMNS),
            [...LegalDocumentVersion::INFORMATIONAL_TYPES, array_key_first(Application::CONSENT_COLUMNS)],
        );
    }

    /**
     * Wspólna logika sprawdzająca dla wszystkich trzech prób powyżej:
     * każdy rodzaj z `$types` musi być w dokładnie jednym z dwóch zbiorów
     * (XOR). Rodzaj w żadnym ze zbiorów lub w obu naraz przerywa próbę
     * asercją `assertNotEquals` (equal === oba `true` albo oba `false`).
     *
     * @param  list<string>  $types
     * @param  list<string>  $consentTypes
     * @param  list<string>  $informationalTypes
     */
    private function assertTypesArePartitioned(array $types, array $consentTypes, array $informationalTypes): void
    {
        $consentSet = array_flip($consentTypes);
        $informationalSet = array_flip($informationalTypes);

        foreach ($types as $type) {
            $inConsent = isset($consentSet[$type]);
            $inInformational = isset($informationalSet[$type]);

            $this->assertNotEquals(
                $inConsent,
                $inInformational,
                "Rodzaj '{$type}' musi należeć do dokładnie jednego zbioru (zgoda XOR informacyjny); ".
                'jest: zgoda='.($inConsent ? 'tak' : 'nie').', informacyjny='.($inInformational ? 'tak' : 'nie').'.'
            );
        }
    }
}
