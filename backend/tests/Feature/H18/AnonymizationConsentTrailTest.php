<?php

namespace Tests\Feature\H18;

use App\Models\AuditLogEntry;
use App\Models\Consent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Feature\H13\CertificatePackageCase;

/**
 * Świadek pisany Z KRYTERIUM (opisu zachowania), nie z kodu naprawy.
 *
 * Anonimizacja konta ma zostawiać ślad w tabeli `consents`: każda zgoda,
 * która była udzielona i jeszcze nie wycofana, dostaje `withdrawn_at` w
 * chwili zabiegu — inaczej ekran administracji dalej pokazuje ją jako
 * żywą, a wiersz „bez daty wycofania po zabiegu" myli się z wierszem,
 * którego nigdy nie było. Zgoda wycofana wcześniej przez samą osobę ma
 * zachować własną, wcześniejszą datę — zabieg nie ma prawa jej nadpisać.
 * Rodzaj zgody i wersja dokumentu (`type`, `document_version`) mają zostać
 * bez zmian — ślad niesie wyłącznie fakt i datę, nic więcej, tak samo jak
 * wpis audytu o anonimizacji, który celowo zapisuje się bez ładunku.
 */
class AnonymizationConsentTrailTest extends CertificatePackageCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::where('email', 'admin@demo.pl')->firstOrFail();
    }

    /**
     * Noga 1 + 3: konto ma jedną zgodę udzieloną (dostaje datę wycofania) i
     * jedną zgodę, której nigdy nie udzielono (nie ma wiersza w ogóle) —
     * po zabiegu te dwa stany mają zostać rozróżnialne.
     */
    public function test_granted_consent_gets_withdrawn_at_but_never_granted_stays_absent(): void
    {
        $grad = $this->makeEligibleVolunteer();

        $granted = Consent::create([
            'user_id' => $grad->id,
            'type' => 'przetwarzanie_danych',
            'document_version' => '1.0',
            'granted_at' => now()->subDays(30),
            'withdrawn_at' => null,
        ]);

        $this->assertNull(
            Consent::where('user_id', $grad->id)->where('type', 'publikacja_profilu')->first(),
            'fixture assumption: zgoda publikacja_profilu nigdy nie została udzielona'
        );

        $this->actingAs($this->admin(), 'keycloak');
        $response = $this->postJson("/api/v1/admin/users/{$grad->id}/anonymize");
        $this->assertLessThan(300, $response->getStatusCode(), 'procedura anonimizacji nie powiodła się: '.$response->getStatusCode().' '.$response->getContent());

        $grantedAfter = $granted->fresh();
        $this->assertNotNull($grantedAfter->withdrawn_at, 'zgoda udzielona i niewycofana nie dostała daty wycofania po anonimizacji');
        $this->assertTrue(
            $grantedAfter->withdrawn_at->diffInSeconds(now()) < 10,
            'data wycofania nie odpowiada chwili zabiegu'
        );

        // Rodzaj zgody i wersja dokumentu — nietknięte.
        $this->assertSame('przetwarzanie_danych', $grantedAfter->type, 'typ zgody zmienił się przy zabiegu');
        $this->assertSame('1.0', $grantedAfter->document_version, 'wersja dokumentu zmieniła się przy zabiegu');

        // Brak zgody zostaje brakiem — nie powstał żaden wiersz.
        $this->assertNull(
            Consent::where('user_id', $grad->id)->where('type', 'publikacja_profilu')->first(),
            'anonimizacja dopisała wiersz zgody, której osoba nigdy nie udzieliła — "nigdy nie udzielił" i "wycofał" przestały być rozróżnialne'
        );
    }

    /**
     * Noga 2: zgoda wycofana wcześniej przez samą osobę ma zachować własną
     * datę — zabieg nie ma prawa jej nadpisać swoją chwilą.
     */
    public function test_previously_withdrawn_consent_keeps_its_own_timestamp(): void
    {
        $grad = $this->makeEligibleVolunteer();

        // Kolumna `withdrawn_at` jest `timestamp` bez ułamków sekundy — data
        // wejściowa jest tu od razu obcięta do pełnej sekundy, żeby
        // porównanie z wartością odczytaną z bazy nie fałszowało wyniku
        // różnicą mikrosekund, której baza nigdy nie przechowuje.
        $earlierWithdrawal = Carbon::parse(now()->subWeek()->format('Y-m-d H:i:s'));
        $withdrawn = Consent::create([
            'user_id' => $grad->id,
            'type' => 'publikacja_profilu',
            'document_version' => '2.0',
            'granted_at' => now()->subMonths(2),
            'withdrawn_at' => $earlierWithdrawal,
        ]);

        $this->actingAs($this->admin(), 'keycloak');
        $response = $this->postJson("/api/v1/admin/users/{$grad->id}/anonymize");
        $this->assertLessThan(300, $response->getStatusCode(), 'procedura anonimizacji nie powiodła się: '.$response->getStatusCode().' '.$response->getContent());

        $withdrawnAfter = $withdrawn->fresh();
        $this->assertNotNull($withdrawnAfter->withdrawn_at, 'data wycofania zniknęła po anonimizacji');
        $this->assertTrue(
            $earlierWithdrawal->equalTo($withdrawnAfter->withdrawn_at),
            'anonimizacja nadpisała wcześniejszą datę wycofania zgody swoją własną chwilą — było: '
                .$earlierWithdrawal->toIso8601String().', jest: '.$withdrawnAfter->withdrawn_at->toIso8601String()
        );
    }

    /**
     * Noga 4 (druga część): ślad nie niesie treści osobowej — sam wpis
     * audytu operacji anonimizacji ma zostać bez ładunku, tak jak przed
     * zmianą (ta naprawa dotyka tylko tabeli `consents`, nie audytu).
     */
    public function test_audit_entry_for_the_procedure_still_carries_no_payload(): void
    {
        $grad = $this->makeEligibleVolunteer();

        Consent::create([
            'user_id' => $grad->id,
            'type' => 'przetwarzanie_danych',
            'document_version' => '1.0',
            'granted_at' => now()->subDays(5),
            'withdrawn_at' => null,
        ]);

        $this->actingAs($this->admin(), 'keycloak');
        $response = $this->postJson("/api/v1/admin/users/{$grad->id}/anonymize");
        $this->assertLessThan(300, $response->getStatusCode(), 'procedura anonimizacji nie powiodła się: '.$response->getStatusCode().' '.$response->getContent());

        $entry = AuditLogEntry::latest('id')->first();
        $this->assertNotNull($entry, 'operacja anonimizacji nie zostawiła wpisu w dzienniku czynności');
        $this->assertNull(
            $entry->details,
            'wpis audytu anonimizacji niesie ładunek (details) zamiast być pusty: '.json_encode($entry->details)
        );
    }

    /**
     * Noga 5: powtórzenie zabiegu na koncie już zanonimizowanym (409) ma
     * domknąć ślad, jeśli go brakowało (stan zastany budowany wprost,
     * dokładnie jak w `test_already_anonymized_account_leaves_no_profile_document_or_diploma_scan_behind`
     * obok), i niczego nie zepsuć, jeśli ślad już tam był (budowany
     * REALNYM, jednokrotnym wywołaniem procedury, potem powtórka).
     */
    public function test_repeating_the_procedure_on_an_already_anonymized_account_closes_a_missing_trail_without_touching_an_existing_one(): void
    {
        // --- Konto A: stan zastany — anonymized_at ustawiony z pominięciem
        // procedury, zgoda udzielona nadal bez śladu wycofania.
        $gradA = $this->makeEligibleVolunteer();
        $grantedA = Consent::create([
            'user_id' => $gradA->id,
            'type' => 'przetwarzanie_danych',
            'document_version' => '1.0',
            'granted_at' => now()->subDays(10),
            'withdrawn_at' => null,
        ]);
        $gradA->forceFill(['anonymized_at' => now()->subDay(), 'status' => 'deleted'])->save();

        $this->actingAs($this->admin(), 'keycloak');
        $responseA = $this->postJson("/api/v1/admin/users/{$gradA->id}/anonymize");
        $this->assertSame(409, $responseA->getStatusCode(), 'konto zastane jako zanonimizowane nie zwróciło 409: '.$responseA->getContent());

        $this->assertNotNull(
            $grantedA->fresh()->withdrawn_at,
            'powtórzenie zabiegu (409) nie domknęło brakującego śladu wycofania na koncie już zanonimizowanym'
        );

        // --- Konto B: ślad już powstał przy PIERWSZYM, realnym wywołaniu
        // procedury — drugie wywołanie (409) ma go zostawić w spokoju.
        $gradB = $this->makeEligibleVolunteer();
        $grantedB = Consent::create([
            'user_id' => $gradB->id,
            'type' => 'przetwarzanie_danych',
            'document_version' => '1.0',
            'granted_at' => now()->subDays(10),
            'withdrawn_at' => null,
        ]);

        $this->actingAs($this->admin(), 'keycloak');
        $first = $this->postJson("/api/v1/admin/users/{$gradB->id}/anonymize");
        $this->assertLessThan(300, $first->getStatusCode(), 'pierwsza procedura anonimizacji nie powiodła się: '.$first->getStatusCode().' '.$first->getContent());

        $withdrawnAtAfterFirst = $grantedB->fresh()->withdrawn_at;
        $this->assertNotNull($withdrawnAtAfterFirst, 'fixture assumption: pierwsze wywołanie zostawiło ślad wycofania');

        $this->actingAs($this->admin(), 'keycloak');
        $second = $this->postJson("/api/v1/admin/users/{$gradB->id}/anonymize");
        $this->assertSame(409, $second->getStatusCode(), 'drugie wywołanie na już zanonimizowanym koncie nie zwróciło 409: '.$second->getContent());

        $this->assertTrue(
            $withdrawnAtAfterFirst->equalTo($grantedB->fresh()->withdrawn_at),
            'drugie (powtórzone) wywołanie procedury nadpisało istniejący już ślad wycofania nową datą — było: '
                .$withdrawnAtAfterFirst->toIso8601String().', jest: '.$grantedB->fresh()->withdrawn_at->toIso8601String()
        );
    }
}
