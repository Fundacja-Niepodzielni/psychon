<?php

namespace Tests\Feature\Courses;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

/**
 * GET /api/v1/materials/{material}/download — the signed, expiring link of
 * contract §2 „Kursy (H05)".
 *
 * R2 (sprint-2 §1) fixed WHERE the token's roles decide access: at ISSUANCE,
 * on GET /courses/{slug} (a real `auth:keycloak` request), never at download
 * — the signed route carries no token to read one from. So this file no
 * longer re-tests visibility/the sequential unlock at download time (that
 * belongs to CourseDetailTest / CourseListTest, against the issuing route);
 * it tests exactly what the download route itself still checks: the
 * signature, its TTL ceiling, the `u` it was issued for, and the account's
 * block/anonymize state — never a role.
 *
 * The link replaces the Authorization header a browser download cannot send,
 * so its whole security value is that it stays bound and stays short-lived:
 * every case below forces an actual refusal rather than inspecting the URL.
 */
class MaterialDownloadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Faked before seeding so CoursesPackageSeeder writes its placeholder
        // files here and the suite never touches storage/app/private.
        Storage::fake('local');

        $this->seed();
    }

    public function test_a_valid_signed_link_streams_the_file(): void
    {
        $url = $this->downloadUrlFor('marta@demo.pl', 'wywiad-psychologiczny');

        $response = $this->get($url)->assertOk();

        $this->assertSame('application/pdf', $response->headers->get('content-type'));
        $this->assertStringContainsString(
            'attachment',
            (string) $response->headers->get('content-disposition'),
        );
        $this->assertStringStartsWith('%PDF-', $response->streamedContent());
    }

    public function test_the_issued_link_is_signed_for_the_configured_ttl(): void
    {
        $ttl = (int) config('courses.material_link_ttl_seconds');
        $this->assertSame(300, $ttl, 'Kontrakt zakłada TTL = 5 minut (300 s).');

        $this->travelTo(now());
        $url = $this->downloadUrlFor('marta@demo.pl', 'wywiad-psychologiczny');

        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        $this->assertSame(now()->addSeconds($ttl)->getTimestamp(), (int) $query['expires']);
    }

    // (b) Po terminie ważności.
    public function test_a_link_used_after_its_ttl_is_refused(): void
    {
        $ttl = (int) config('courses.material_link_ttl_seconds');
        $url = $this->downloadUrlFor('marta@demo.pl', 'wywiad-psychologiczny');

        $this->travel($ttl + 60)->seconds();

        $this->get($url)->assertStatus(403);
    }

    // (a) Link wydany dla sub A, użyty przez sub B.
    public function test_a_link_repointed_at_another_account_is_refused(): void
    {
        $url = $this->downloadUrlFor('marta@demo.pl', 'wywiad-psychologiczny');

        $tampered = str_replace(
            'u='.$this->user('marta@demo.pl')->id,
            'u='.$this->user('filip@demo.pl')->id,
            $url,
        );

        $this->assertNotSame($url, $tampered, 'Podmiana parametru u nie doszła do skutku.');

        $this->get($tampered)->assertStatus(403);
    }

    // (f) Zmieniony identyfikator materiału przy tym samym podpisie.
    public function test_a_tampered_material_id_with_the_original_signature_is_refused(): void
    {
        $marta = $this->user('marta@demo.pl');
        $this->actingAs($marta, 'keycloak');

        $materials = $this->getJson('/api/v1/courses/wywiad-psychologiczny')
            ->assertOk()
            ->json('data.materials');

        $url = $materials[0]['download_url'];
        $originalId = $materials[0]['id'];

        // Le materiał de podstawy-pomocy (etap 1, ukończony przez martę) ma
        // też pojedynczy materiał — inny wiersz do podstawienia w miejscu
        // {material} bez naruszania reszty query stringa/sygnatury.
        $otherMaterialId = $originalId + 1;
        $this->assertNotSame($originalId, $otherMaterialId);

        $tampered = str_replace(
            '/materials/'.$originalId.'/download',
            '/materials/'.$otherMaterialId.'/download',
            $url,
        );

        $this->assertNotSame($url, $tampered, 'Podmiana identyfikatora materiału nie doszła do skutku.');

        $this->get($tampered)->assertStatus(403);
    }

    // (c) Rola zmieniona w Kontach po wydaniu, przed pobraniem: świadomie
    // 200 do końca TTL — download nie czyta ról wcale.
    public function test_a_role_change_after_issuance_does_not_revoke_the_link_within_its_ttl(): void
    {
        // wywiad-psychologiczny (sequence_order=2) jest widoczny wyłącznie dla
        // wolontariusza (CourseCatalogQuery::visibleTo) — issuance-time role.
        $url = $this->downloadUrlFor('marta@demo.pl', 'wywiad-psychologiczny');

        $marta = $this->user('marta@demo.pl');
        // Po wydaniu linku rola przestaje dawać widoczność tego kursu —
        // pod starym (usuniętym) zachowaniem pobranie by to wykryło.
        $marta->forceFill(['role' => 'student'])->save();

        $this->get($url)->assertOk();
    }

    // (e) Konto zablokowane po wydaniu, przed pobraniem.
    public function test_a_blocked_account_cannot_use_a_link_issued_before_the_block(): void
    {
        $url = $this->downloadUrlFor('marta@demo.pl', 'wywiad-psychologiczny');

        $marta = $this->user('marta@demo.pl');
        $marta->forceFill(['status' => 'blocked'])->save();

        $this->get($url)
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    // (e) Konto zanonimizowane po wydaniu, przed pobraniem.
    public function test_an_anonymized_account_cannot_use_a_link_issued_before_anonymization(): void
    {
        $url = $this->downloadUrlFor('marta@demo.pl', 'wywiad-psychologiczny');

        $marta = $this->user('marta@demo.pl');
        $marta->forceFill(['anonymized_at' => now()])->save();

        $this->get($url)
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'forbidden');
    }

    public function test_an_expired_account_cannot_use_a_link_issued_while_it_was_active(): void
    {
        // The signed route runs no `access.active` middleware, so the time-boxed
        // gate has to hold in the controller — otherwise a link issued minutes
        // before expiry outlives the access it was granted under.
        $url = $this->downloadUrlFor('marta@demo.pl', 'wywiad-psychologiczny');

        $marta = $this->user('marta@demo.pl');
        $marta->forceFill([
            'access_expires_at' => now()->subDay(),
            'program_completed_at' => null,
        ])->save();

        $this->get($url)
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'access_expired');
    }

    // TTL 300 s z konfiguracji: link, którego podpisany `expires` sięga dalej
    // niż konfigurowany pułap od chwili żądania, jest odrzucany — nawet gdy
    // jeszcze technicznie nie wygasł wg samego podpisu.
    public function test_a_link_signed_for_longer_than_the_configured_ttl_is_refused(): void
    {
        $ttl = (int) config('courses.material_link_ttl_seconds');
        $this->assertSame(300, $ttl);

        $this->travelTo(now());
        $marta = $this->user('marta@demo.pl');
        $material = $this->materialIdFor('wywiad-psychologiczny');

        $tooLong = URL::temporarySignedRoute(
            'materials.download',
            now()->addSeconds($ttl + 1),
            ['material' => $material, 'u' => $marta->id],
        );

        $this->get($tooLong)
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'link_expired');
    }

    public function test_a_row_without_bytes_on_disk_is_not_found(): void
    {
        $url = $this->downloadUrlFor('marta@demo.pl', 'wywiad-psychologiczny');

        Storage::disk('local')->deleteDirectory('materials');

        $this->get($url)
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
    }

    /**
     * Takes the link exactly as the API hands it to the client, so the test
     * exercises the URL the browser would follow.
     */
    private function downloadUrlFor(string $email, string $slug): string
    {
        $this->actingAs($this->user($email), 'keycloak');

        $url = $this->getJson("/api/v1/courses/{$slug}")
            ->assertOk()
            ->json('data.materials.0.download_url');

        $this->assertIsString($url, "Kurs {$slug} nie zwrócił linku do materiału.");

        return $url;
    }

    private function materialIdFor(string $slug): int
    {
        $this->actingAs($this->user('admin@demo.pl'), 'keycloak');

        $id = $this->getJson("/api/v1/courses/{$slug}")
            ->assertOk()
            ->json('data.materials.0.id');

        $this->assertIsInt($id, "Kurs {$slug} nie zwrócił materiału.");

        return $id;
    }

    private function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }
}
