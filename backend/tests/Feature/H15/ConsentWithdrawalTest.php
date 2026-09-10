<?php

namespace Tests\Feature\H15;

use App\Models\AuditLogEntry;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Świadek pisany Z KRYTERIUM (karta H15, kryterium 4).
 *
 * Kryterium: po wycofaniu zgody → wiersz w audycie ze slugiem `profile.withdrawn`
 * **i** wiersz powiadomienia dla roli zespołu; status profilu `withdrawn`;
 * drugie wycofanie → 422.
 *
 * Slug jest przesądzony: dewiacja **D21/D22 PRZYJĘTA** (`18-rozstrzygniecia-dewiacji.md`),
 * `profile.withdrawn` stoi w obu rejestrach kontraktu — §3.1 (powiadomienia)
 * i §3.2 (audyt, „jedyne źródło prawdy o slugach"). Luka jest tylko po stronie emisji.
 *
 * ⚠ ODBIORCA POWIADOMIENIA — założenie, nie cytat. Żaden z rejestrów kontraktu nie
 * mówi, KTO dostaje `profile.withdrawn`. Wymaganie biznesowe wskazuje role „koordynator"
 * i „administrator", ale takich identyfikatorów w kontrakcie nie ma: §3.4 wymienia
 * `super_admin · project_manager · instructor · volunteer · student`. Przyjmuję
 * odwzorowanie po etykietach polskich: koordynator → `project_manager`
 * („Opiekun Projektu"), administrator → `super_admin`. Zgłoszone plikiem w kanale.
 *
 * Świadek jest napisany tak, żeby NIE przesądzać liczby ani treści powiadomień —
 * sprawdza, że trafiają do zespołu i **nie trafiają do uczestniczek**. Test, który
 * wymusza dokładnie dwa wiersze, kupowałby precyzję za cenę zgadywania.
 *
 * ⚠ Czerwony do czasu emisji powiadomienia zespołu przy wycofaniu zgody.
 * Nie naprawiam tutaj — ten plik tylko mierzy.
 *
 * `php artisan test --filter=ConsentWithdrawal`
 */
class ConsentWithdrawalTest extends TestCase
{
    use RefreshDatabase;

    private const SLUG = 'profile.withdrawn';

    /** Role zespołu wg odwzorowania z nagłówka. */
    private const ROLE_ZESPOLU = ['project_manager', 'super_admin'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_withdrawing_consent_sets_the_profile_status(): void
    {
        $absolwentka = $this->absolwentkaZeZgoda();

        $this->postJson('/api/v1/psychologist-profile/consent/withdraw')->assertOk();

        $this->assertSame(
            'withdrawn',
            $this->statusProfilu($absolwentka),
            'Profil nie przeszedł w stan `withdrawn` — zgoda została wycofana tylko na papierze.',
        );
    }

    public function test_withdrawing_consent_writes_the_audit_slug_from_the_registry(): void
    {
        $absolwentka = $this->absolwentkaZeZgoda();

        $this->postJson('/api/v1/psychologist-profile/consent/withdraw')->assertOk();

        $this->assertTrue(
            AuditLogEntry::where('action', self::SLUG)->exists(),
            'Brak wpisu audytu `'.self::SLUG.'`. Slug jest w rejestrze §3.2 od dewiacji D21/D22 — '
            .'rejestr bez emisji jest deklaracją, nie śladem.',
        );
    }

    public function test_withdrawing_consent_notifies_the_team(): void
    {
        $absolwentka = $this->absolwentkaZeZgoda();

        $this->postJson('/api/v1/psychologist-profile/consent/withdraw')->assertOk();

        $odbiorcy = Notification::where('type', self::SLUG)
            ->join('users', 'users.id', '=', 'notifications.user_id')
            ->pluck('users.role')
            ->unique()
            ->values()
            ->all();

        $this->assertNotEmpty($odbiorcy, 'Nikt nie dostał powiadomienia o wycofaniu zgody.');

        $this->assertNotEmpty(
            array_intersect($odbiorcy, self::ROLE_ZESPOLU),
            'Powiadomienie nie trafiło do żadnej roli zespołu. Trafiło do: '.implode(', ', $odbiorcy),
        );
    }

    public function test_the_withdrawal_notification_does_not_reach_participants(): void
    {
        // KONTROLA NEGATYWNA. Powiadomienie „do zespołu" wysłane WSZYSTKIM też
        // spełniłoby test wyżej — i byłoby wyciekiem informacji o cudzej decyzji.
        $absolwentka = $this->absolwentkaZeZgoda();

        $this->postJson('/api/v1/psychologist-profile/consent/withdraw')->assertOk();

        $uczestniczki = Notification::where('type', self::SLUG)
            ->join('users', 'users.id', '=', 'notifications.user_id')
            ->whereIn('users.role', ['volunteer', 'student'])
            ->pluck('users.email')
            ->all();

        $this->assertSame(
            [],
            $uczestniczki,
            'Powiadomienie o wycofaniu zgody dostały uczestniczki: '.implode(', ', $uczestniczki),
        );
    }

    public function test_withdrawing_twice_is_refused(): void
    {
        $this->absolwentkaZeZgoda();

        $this->postJson('/api/v1/psychologist-profile/consent/withdraw')->assertOk();

        $this->postJson('/api/v1/psychologist-profile/consent/withdraw')
            ->assertStatus(422);
    }

    public function test_the_second_withdrawal_does_not_duplicate_the_audit_entry(): void
    {
        // Bez tego „drugie wycofanie → 422" spełniłby serwer, który najpierw robi
        // robotę, a dopiero potem odmawia. Odmowa ma być PRZED skutkiem.
        $this->absolwentkaZeZgoda();

        $this->postJson('/api/v1/psychologist-profile/consent/withdraw')->assertOk();
        $poPierwszym = AuditLogEntry::where('action', self::SLUG)->count();

        $this->postJson('/api/v1/psychologist-profile/consent/withdraw');

        $this->assertSame(
            $poPierwszym,
            AuditLogEntry::where('action', self::SLUG)->count(),
            'Odrzucone drugie wycofanie mimo wszystko dopisało wpis audytu.',
        );
    }

    /**
     * Absolwentka z profilem ZŁOŻONYM i zgodą UDZIELONĄ.
     *
     * Pierwsza wersja tego pomocnika brała `olę` z seedu i zakładała, że zgoda
     * jest udzielona. Nie była — seed daje jej profil `draft`, a API odpowiadało
     * „Brak udzielonej zgody na publikację do wycofania". Sześć czerwieni było
     * wtedy wadą przyrządu, nie luką produktu, i tak zostało zgłoszone.
     * Świadek buduje więc stan wprost: profil → dyplom → `submit` ze zgodą.
     */
    private function absolwentkaZeZgoda(): User
    {
        $absolwentka = User::factory()->create([
            'role' => 'volunteer',
            'program_completed_at' => now()->subDay(),
        ]);

        $this->actingAs($absolwentka, 'sanctum')
            ->patchJson('/api/v1/psychologist-profile', [
                'specializations' => ['wsparcie w kryzysie'],
                'approach' => 'systemowy',
                'city' => 'Gdańsk',
            ])->assertOk();

        $this->actingAs($absolwentka, 'sanctum')
            ->postJson('/api/v1/psychologist-profile/documents', [
                'type' => 'dyplom',
                'file' => UploadedFile::fake()->create('dyplom.pdf', 100, 'application/pdf'),
            ])->assertCreated();

        $this->actingAs($absolwentka, 'sanctum')
            ->postJson('/api/v1/psychologist-profile/submit', ['publication_consent' => true])
            ->assertOk();

        $this->actingAs($absolwentka, 'sanctum');

        return $absolwentka;
    }

    private function statusProfilu(User $user): ?string
    {
        return DB::table('psychologist_profiles')->where('user_id', $user->id)->value('status');
    }
}
