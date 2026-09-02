<?php

namespace Tests\Feature\H18;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * S1-3 · świadek pisany Z KRYTERIUM, nie z kodu wykonawcy.
 *
 * Kryterium (`ZLECENIE-001` §2.1): `POST /admin/users` **i** `PATCH /admin/users/{id}`
 * z `pesel:"00000000000"` → 422; poprawny syntetyczny PESEL → 2xx; regresja H01 bez zmian.
 *
 * Klasa znaleziska (`WYTYCZNE-PRACY-PSYCHON` §8.1): reguła `Rules\Pesel` **istnieje**
 * i działa w H01, ale administracja pilnuje **wyliczonych** pól (`max:32`), a nie
 * wszystkich. Kryterium ★ H01 zostaje wywrócone tylnymi drzwiami — nie dlatego, że
 * kontroli nie ma, tylko dlatego, że jest denylistą tam, gdzie powinna być allowlistą.
 *
 * ⚠ Czerwony do czasu pozycji S1-3 (zakres KOD-DOPIECIA). Nie naprawiam.
 *
 * DANE: wszystkie numery poniżej są SYNTETYCZNE — poprawna suma kontrolna,
 * nieistniejąca osoba. Żadnych prawdziwych danych osobowych (`ZLECENIE-001` §1.7).
 *
 * UWAGA DLA PISZĄCYCH TU DALEJ: `pesel` oraz `address_*` mają cast `encrypted`.
 * `assertDatabaseHas(['pesel' => …])` nie zadziała nigdy — szyfrowanie jest
 * niedeterministyczne, więc porównanie z zawartością kolumny zawsze zawodzi.
 * Skutek sprawdzaj przez model (`$user->pesel`), nie przez kolumnę.
 *
 * `php artisan test --filter=AdminUserPesel`
 */
class AdminUserPeselTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    /**
     * Syntetyczny, POPRAWNY numer: 1990-01-01, seria 1234, cyfra kontrolna 9.
     * Suma ważona 1,3,7,9,1,3,7,9,1,3 daje 61 → cyfra (10 − 1) mod 10 = 9.
     */
    private const PESEL_POPRAWNY = '90010112349';

    /**
     * Numer z kryterium. Uwaga na pozór paradoksalna, a istotna dla świadka:
     * `00000000000` ma **poprawną sumę kontrolną** (suma ważona = 0 → cyfra 0).
     * Odrzuca go dopiero kontrola daty (miesiąc `00` nie istnieje). Walidacja
     * licząca wyłącznie sumę kontrolną przepuściłaby go — dlatego to jest dobry
     * przypadek testowy, a nie dowolne „same zera".
     */
    private const PESEL_ZLY = '00000000000';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_creating_a_user_with_an_impossible_pesel_is_rejected(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/v1/admin/users', $this->nowaOsoba(['pesel' => self::PESEL_ZLY]))
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertDatabaseMissing('users', ['email' => 'nowa.osoba@example.test']);
    }

    public function test_creating_a_user_with_a_valid_synthetic_pesel_succeeds(): void
    {
        // KONTROLA POZYTYWNA. Bez niej „odrzuca zły PESEL" spełniłby też serwer,
        // który odrzuca KAŻDY PESEL — i nikt by nie zauważył, dopóki administracja
        // nie spróbowałaby założyć prawdziwego konta.
        $this->actingAsRole('super_admin');

        $response = $this->postJson('/api/v1/admin/users', $this->nowaOsoba(['pesel' => self::PESEL_POPRAWNY]));

        $this->assertTrue(
            $response->status() >= 200 && $response->status() < 300,
            'Poprawny syntetyczny PESEL został odrzucony (status '.$response->status().').',
        );

        // ⚠ NIE przez `assertDatabaseHas`. `pesel` ma w modelu cast `encrypted`
        // (tak samo `address_street`, `address_city`, `address_zip`), a szyfrowanie
        // Laravela jest NIEDETERMINISTYCZNE — w kolumnie leży za każdym razem inny
        // kryptogram. Asercja na kolumnie nie miałaby prawa trafić NIGDY, także po
        // poprawnej naprawie; byłaby czerwienią wiecznie mylącą wykonawcę.
        // „Skutek w bazie" dla pól szyfrowanych czyta się przez model, który je odszyfruje.
        $utworzona = User::where('email', 'nowa.osoba@example.test')->first();

        $this->assertNotNull($utworzona, 'Konto nie powstało.');
        $this->assertSame(self::PESEL_POPRAWNY, $utworzona->pesel);
    }

    public function test_updating_a_user_with_an_impossible_pesel_is_rejected(): void
    {
        // To są TYLNE DRZWI z raportu odbiorczego: nawet gdy tworzenie jest szczelne,
        // edycja potrafi wpuścić to samo.
        $this->actingAsRole('super_admin');
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $peselPrzed = $marta->pesel;

        $this->patchJson("/api/v1/admin/users/{$marta->id}", ['pesel' => self::PESEL_ZLY])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');

        $this->assertSame(
            $peselPrzed,
            $marta->fresh()->pesel,
            'Odrzucone żądanie mimo wszystko zmieniło dane — 422 był pozorem.',
        );
    }

    public function test_updating_a_user_with_a_valid_synthetic_pesel_succeeds(): void
    {
        $this->actingAsRole('super_admin');
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $this->patchJson("/api/v1/admin/users/{$marta->id}", ['pesel' => self::PESEL_POPRAWNY])
            ->assertOk();

        $this->assertSame(self::PESEL_POPRAWNY, $marta->fresh()->pesel);
    }

    public function test_a_pesel_of_the_wrong_length_is_rejected_in_administration(): void
    {
        // Wariant SPOZA pokazanego przypadku (§8.2: perturbacja ma rozpinać klasę,
        // nie powtarzać instancję). Dziś przechodzi przez `max:32`, bo 32 znaki
        // to nie jest jedenaście cyfr.
        $this->actingAsRole('super_admin');
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $this->patchJson("/api/v1/admin/users/{$marta->id}", ['pesel' => '123'])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_the_h01_profile_rule_still_refuses_the_same_number(): void
    {
        // REGRESJA H01 z kryterium: naprawa administracji nie ma prawa poluzować
        // kontroli, która już działa. Ten test jest zielony DZIŚ i ma taki zostać.
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $this->actingAs($marta, 'sanctum');

        $this->patchJson('/api/v1/me', ['pesel' => self::PESEL_ZLY])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_the_h01_profile_rule_accepts_the_valid_synthetic_number(): void
    {
        // Druga połowa regresji: H01 ma nadal PRZYJMOWAĆ poprawny numer.
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();
        $this->actingAs($marta, 'sanctum');

        $this->patchJson('/api/v1/me', ['pesel' => self::PESEL_POPRAWNY])->assertOk();

        $this->assertSame(self::PESEL_POPRAWNY, $marta->fresh()->pesel);
    }

    /** @return array<string, mixed> */
    private function nowaOsoba(array $overrides = []): array
    {
        return array_merge([
            'first_name' => 'Nowa',
            'last_name' => 'Osoba',
            'email' => 'nowa.osoba@example.test',
            'role' => 'volunteer',
        ], $overrides);
    }
}
