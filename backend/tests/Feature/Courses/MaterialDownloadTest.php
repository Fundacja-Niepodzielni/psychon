<?php

namespace Tests\Feature\Courses;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * GET /api/v1/materials/{material}/download — the signed, expiring link of
 * contract §2 „Kursy (H05)" („podpisany, wygasa").
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

    public function test_a_link_used_after_its_window_is_refused(): void
    {
        $url = $this->downloadUrlFor('marta@demo.pl', 'wywiad-psychologiczny');

        // Contract §2 / plan phase 3: the link is valid for 15 minutes.
        $this->travel(16)->minutes();

        $this->get($url)->assertStatus(403);
    }

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

    public function test_the_link_owner_still_has_to_pass_the_unlock_rule(): void
    {
        // Signature validity is not access: marta's stage 3 is locked, and the
        // controller re-checks the state at download time (contract §1.1).
        $url = $this->downloadUrlFor('admin@demo.pl', 'interwencja-kryzysowa');

        $marta = $this->user('marta@demo.pl');
        $signedForMarta = $this->reissueFor($url, $marta);

        $this->get($signedForMarta)
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'course_locked');
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

    public function test_a_material_of_a_course_outside_the_users_scope_is_not_found(): void
    {
        // The path courses are invisible to a student (role matrix §2) — the
        // signed link must answer like the material does not exist.
        $url = $this->downloadUrlFor('admin@demo.pl', 'wywiad-psychologiczny');

        $signedForFilip = $this->reissueFor($url, $this->user('filip@demo.pl'));

        $this->get($signedForFilip)
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'not_found');
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
        Sanctum::actingAs($this->user($email));

        $url = $this->getJson("/api/v1/courses/{$slug}")
            ->assertOk()
            ->json('data.materials.0.download_url');

        $this->assertIsString($url, "Kurs {$slug} nie zwrócił linku do materiału.");

        return $url;
    }

    /** Re-signs the same material for another account, as the app would. */
    private function reissueFor(string $url, User $user): string
    {
        $materialId = (int) explode('/', parse_url($url, PHP_URL_PATH))[4];

        return URL::temporarySignedRoute(
            'materials.download',
            now()->addMinutes(15),
            ['material' => $materialId, 'u' => $user->id],
        );
    }

    private function user(string $email): User
    {
        return User::where('email', $email)->firstOrFail();
    }
}
