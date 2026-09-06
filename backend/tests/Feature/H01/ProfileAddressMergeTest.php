<?php

namespace Tests\Feature\H01;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * S1-4 · świadek pisany Z KRYTERIUM, nie z kodu wykonawcy.
 *
 * Kryterium: po `PATCH {address:{city}}` pola `address_street`
 * i `address_zip` w bazie **niezmienione**; po `{address:{street:null}}` NULL dostaje
 * **wyłącznie** `street`.
 *
 * Rzecz, o którą tu chodzi, jest cichą utratą danych: `PATCH` obiecuje zmianę
 * częściową, a zagnieżdżona tablica podmieniana w całości kasuje pola, których
 * nikt nie wysłał. Uczestniczka poprawia miasto i traci ulicę oraz kod pocztowy,
 * nie widząc żadnego błędu. Odpowiedź 200 jest tu **częścią problemu**, nie dowodem
 * poprawności — dlatego każdy przypadek sprawdza skutek W BAZIE, a nie w odpowiedzi.
 *
 * Rozróżnienie, które musi przetrwać naprawę: **pole nieobecne** to „nie ruszaj",
 * a **pole równe `null`** to „wyczyść". Naprawa, która scala tak, że `null` też jest
 * ignorowany, zamienia jedną wadę na drugą — użytkowniczka nie ma jak wyczyścić pola.
 *
 * ⚠ Czerwony do czasu naprawy scalania częściowego przy `PATCH` adresu profilu.
 * Nie naprawiam tutaj — ten plik tylko mierzy.
 *
 * `php artisan test --filter=ProfileAddressMerge`
 */
class ProfileAddressMergeTest extends TestCase
{
    use RefreshDatabase;

    private const ULICA = 'ul. Testowa 1';

    private const MIASTO = 'Warszawa';

    private const KOD = '00-001';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_patching_only_the_city_keeps_street_and_zip(): void
    {
        $marta = $this->martaZPelnymAdresem();

        $this->patchJson('/api/v1/me', ['address' => ['city' => 'Kraków']])->assertOk();

        $po = $marta->fresh();

        $this->assertSame('Kraków', $po->address_city);
        $this->assertSame(self::ULICA, $po->address_street, 'PATCH samego miasta wyczyścił ulicę.');
        $this->assertSame(self::KOD, $po->address_zip, 'PATCH samego miasta wyczyścił kod pocztowy.');
    }

    public function test_patching_only_the_street_keeps_city_and_zip(): void
    {
        // Ten sam mechanizm od drugiej strony — żeby naprawa nie okazała się
        // szczególnym przypadkiem dopasowanym do jednego pola.
        $marta = $this->martaZPelnymAdresem();

        $this->patchJson('/api/v1/me', ['address' => ['street' => 'ul. Inna 7']])->assertOk();

        $po = $marta->fresh();

        $this->assertSame('ul. Inna 7', $po->address_street);
        $this->assertSame(self::MIASTO, $po->address_city);
        $this->assertSame(self::KOD, $po->address_zip);
    }

    public function test_an_explicit_null_clears_only_the_named_field(): void
    {
        // Druga połowa kryterium. `null` MA czyścić — inaczej naprawa odbiera
        // użytkowniczce możliwość usunięcia danych, czego RODO nie pochwala.
        $marta = $this->martaZPelnymAdresem();

        $this->patchJson('/api/v1/me', ['address' => ['street' => null]])->assertOk();

        $po = $marta->fresh();

        $this->assertNull($po->address_street, 'Jawny null nie wyczyścił ulicy.');
        $this->assertSame(self::MIASTO, $po->address_city, 'Jawny null na ulicy wyczyścił też miasto.');
        $this->assertSame(self::KOD, $po->address_zip, 'Jawny null na ulicy wyczyścił też kod pocztowy.');
    }

    public function test_a_patch_without_the_address_key_does_not_touch_the_address(): void
    {
        // KONTROLA NEGATYWNA. Zmiana czegokolwiek innego nie ma prawa dotknąć adresu.
        $marta = $this->martaZPelnymAdresem();

        $this->patchJson('/api/v1/me', ['first_name' => 'Marta II'])->assertOk();

        $po = $marta->fresh();

        $this->assertSame('Marta II', $po->first_name);
        $this->assertSame(self::ULICA, $po->address_street);
        $this->assertSame(self::MIASTO, $po->address_city);
        $this->assertSame(self::KOD, $po->address_zip);
    }

    public function test_an_empty_address_object_changes_nothing(): void
    {
        // Wariant SPOZA pokazanej instancji (§8.2 — perturbacja ma rozpinać klasę).
        // `address: {}` to żądanie bez treści; podmiana całej tablicy skasowałaby
        // wszystkie trzy pola naraz i nadal zwróciła 200.
        $marta = $this->martaZPelnymAdresem();

        $this->patchJson('/api/v1/me', ['address' => []])->assertOk();

        $po = $marta->fresh();

        $this->assertSame(self::ULICA, $po->address_street);
        $this->assertSame(self::MIASTO, $po->address_city);
        $this->assertSame(self::KOD, $po->address_zip);
    }

    public function test_the_response_shows_the_merged_address_not_the_sent_one(): void
    {
        // Klient rysuje formularz z odpowiedzi. Gdyby odpowiedź niosła to, co wysłano,
        // ekran pokazałby pusty adres nawet przy poprawnym zapisie w bazie — i odwrotnie.
        $this->martaZPelnymAdresem();

        $adres = $this->patchJson('/api/v1/me', ['address' => ['city' => 'Gdańsk']])
            ->assertOk()
            ->json('data.address');

        $this->assertSame('Gdańsk', $adres['city']);
        $this->assertSame(self::ULICA, $adres['street']);
        $this->assertSame(self::KOD, $adres['zip']);
    }

    private function martaZPelnymAdresem(): User
    {
        $marta = User::where('email', 'marta@demo.pl')->firstOrFail();

        $marta->forceFill([
            'address_street' => self::ULICA,
            'address_city' => self::MIASTO,
            'address_zip' => self::KOD,
        ])->save();

        $this->actingAs($marta, 'sanctum');

        return $marta;
    }
}
