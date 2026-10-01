<?php

namespace Tests\Feature\H21;

use App\Models\Setting;
use App\Models\User;
use App\Support\OnboardingContent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Pakiet H21 · Onboarding „Zacznij tutaj".
 *
 * Kryterium 1 — administracja zmienia treść bez kodu, widoczne natychmiast.
 * Kryterium 2 — ekran działa po ukończeniu programu i po wygaśnięciu dostępu.
 */
class OnboardingTest extends TestCase
{
    use RefreshDatabase;

    private const string VIDEO_URL_MESSAGE = 'Adres filmu w internecie musi być pełnym adresem zaczynającym się od https://.';

    public function test_get_onboarding_returns_default_content_when_nothing_is_stored(): void
    {
        $this->actingAs(User::factory()->create(), 'keycloak');

        $this->getJson('/api/v1/onboarding')
            ->assertOk()
            ->assertJsonPath('data.video.title', OnboardingContent::DEFAULTS['video']['title'])
            ->assertJsonPath('data.program.title', OnboardingContent::DEFAULTS['program']['title'])
            ->assertJsonPath('data.expectations.title', OnboardingContent::DEFAULTS['expectations']['title'])
            ->assertJsonPath('data.video.url', null)
            ->assertJsonPath('data.updated_at', null);
    }

    public function test_get_onboarding_returns_stored_content(): void
    {
        OnboardingContent::put(['program' => ['title' => 'Plan', 'body' => 'Treść planu.']]);
        $this->actingAs(User::factory()->create(), 'keycloak');

        $this->getJson('/api/v1/onboarding')
            ->assertOk()
            ->assertJsonPath('data.program.title', 'Plan')
            ->assertJsonPath('data.program.body', 'Treść planu.')
            // sekcje nietknięte zostają na wartościach domyślnych
            ->assertJsonPath('data.expectations.title', OnboardingContent::DEFAULTS['expectations']['title']);
    }

    public function test_admin_updates_content_and_it_is_visible_immediately(): void
    {
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/onboarding', [
            'program' => ['title' => 'Jak to działa', 'body' => 'Nowy opis przebiegu programu.'],
            'video' => ['title' => 'Film wprowadzający', 'url' => 'https://example.test/intro', 'caption' => 'Obejrzyj najpierw to.'],
        ])
            ->assertOk()
            ->assertJsonPath('data.program.body', 'Nowy opis przebiegu programu.')
            ->assertJsonPath('data.video.url', 'https://example.test/intro');

        $this->getJson('/api/v1/onboarding')
            ->assertOk()
            ->assertJsonPath('data.program.title', 'Jak to działa')
            ->assertJsonPath('data.video.caption', 'Obejrzyj najpierw to.')
            ->assertJsonPath('data.expectations.title', OnboardingContent::DEFAULTS['expectations']['title']);
    }

    public function test_super_admin_may_also_update_content(): void
    {
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/onboarding', [
            'expectations' => ['title' => 'Zasady', 'body' => 'Bądź rzetelny.'],
        ])->assertOk();

        $this->assertSame('Zasady', OnboardingContent::get()['expectations']['title']);
    }

    public function test_volunteer_cannot_update_content(): void
    {
        $this->actingAs(User::factory()->role('volunteer')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/onboarding', [
            'program' => ['title' => 'x', 'body' => 'y'],
        ])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'forbidden');

        $this->assertDatabaseMissing('settings', ['key' => OnboardingContent::KEY]);
    }

    public function test_guest_cannot_read_onboarding(): void
    {
        $this->getJson('/api/v1/onboarding')
            ->assertUnauthorized()
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_update_rejects_a_section_with_blank_fields(): void
    {
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/onboarding', [
            'program' => ['title' => ''],
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['program.title', 'program.body']]]);
    }

    public function test_update_rejects_an_invalid_video_url(): void
    {
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/onboarding', [
            'video' => ['title' => 'Film', 'url' => 'not-a-url'],
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    /**
     * Adres filmu trafia do ramki na ekranie każdego uczestnika, więc zapis
     * przyjmuje wyłącznie schemat `https`.
     *
     * @return array<string, array{string}>
     */
    public static function videoAddressesThatAreNotHttps(): array
    {
        return [
            'http' => ['http://example.test/intro'],
            'http in capitals' => ['HTTP://example.test/intro'],
            'data scheme with a host' => ['data://host/x'],
            'file scheme with a host' => ['file://host/x'],
            'javascript scheme' => ['javascript:alert(1)'],
            'protocol-relative address' => ['//host/x'],
            'address without a scheme' => ['example.test/intro'],
            'other scheme' => ['ftp://example.test/intro'],
        ];
    }

    /** @return array<string, array{string}> */
    public static function httpsVideoAddresses(): array
    {
        return [
            'plain https' => ['https://example.test/intro'],
            'https with subdomain, port, query and fragment' => ['https://www.example.test:8443/embed/123?rel=0#t=10'],
            'https written in capitals' => ['HTTPS://example.test/intro'],
        ];
    }

    #[DataProvider('videoAddressesThatAreNotHttps')]
    public function test_update_rejects_a_video_address_that_is_not_https_and_keeps_the_stored_state(string $address): void
    {
        OnboardingContent::put([
            'video' => ['title' => 'Film', 'url' => 'https://example.test/stary', 'caption' => 'Podpis.'],
        ]);
        $before = OnboardingContent::get();
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $response = $this->patchJson('/api/v1/admin/onboarding', [
            'video' => ['title' => 'Nowy film', 'url' => $address],
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['video.url']]]);

        $messages = $response->json('error.errors')['video.url'];

        $this->assertSame([self::VIDEO_URL_MESSAGE], $messages);
        $this->assertStringStartsWith('Adres filmu w internecie', $messages[0]);
        $this->assertSame($before, OnboardingContent::get());
    }

    #[DataProvider('videoAddressesThatAreNotHttps')]
    public function test_update_rejecting_a_video_address_writes_nothing_on_a_fresh_database(string $address): void
    {
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/onboarding', [
            'video' => ['title' => 'Nowy film', 'url' => $address],
        ])->assertStatus(422);

        $this->assertDatabaseMissing('settings', ['key' => OnboardingContent::KEY]);
    }

    #[DataProvider('httpsVideoAddresses')]
    public function test_update_stores_an_https_video_address_exactly_as_given(string $address): void
    {
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/onboarding', [
            'video' => ['title' => 'Film', 'url' => $address],
        ])
            ->assertOk()
            ->assertJsonPath('data.video.url', $address);

        $this->assertSame($address, OnboardingContent::get()['video']['url']);
    }

    /** @return array<string, array{?string}> */
    public static function emptyVideoAddresses(): array
    {
        return ['null' => [null], 'empty string' => ['']];
    }

    #[DataProvider('emptyVideoAddresses')]
    public function test_update_still_accepts_an_empty_video_address_and_clears_the_stored_one(?string $address): void
    {
        OnboardingContent::put(['video' => ['url' => 'https://example.test/stary']]);
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/onboarding', [
            'video' => ['title' => 'Film', 'url' => $address],
        ])->assertOk();

        $this->assertEmpty(OnboardingContent::get()['video']['url']);
    }

    public function test_a_rejected_video_address_saves_none_of_the_other_sections_of_the_same_request(): void
    {
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/onboarding', [
            'program' => ['title' => 'Nowy tytuł', 'body' => 'Nowa treść.'],
            'video' => ['title' => 'Film', 'url' => 'http://example.test/intro'],
        ])->assertStatus(422);

        $this->assertSame(OnboardingContent::DEFAULTS['program'], OnboardingContent::get()['program']);
        $this->assertDatabaseMissing('settings', ['key' => OnboardingContent::KEY]);
    }

    public function test_a_video_address_stored_before_the_rule_is_still_read_and_not_touched_by_other_edits(): void
    {
        OnboardingContent::put([
            'video' => ['title' => 'Stary film', 'url' => 'http://example.test/stary', 'caption' => 'Podpis.'],
        ]);
        $this->actingAs(User::factory()->role('project_manager')->create(), 'keycloak');

        $this->getJson('/api/v1/onboarding')
            ->assertOk()
            ->assertJsonPath('data.video.url', 'http://example.test/stary');

        $this->patchJson('/api/v1/admin/onboarding', [
            'program' => ['title' => 'Tytuł', 'body' => 'Treść.'],
        ])
            ->assertOk()
            ->assertJsonPath('data.video.url', 'http://example.test/stary');

        $this->assertSame('http://example.test/stary', OnboardingContent::get()['video']['url']);
    }

    public function test_onboarding_is_reachable_after_access_expired(): void
    {
        $user = User::factory()->create([
            'access_expires_at' => now()->subDay(),
            'program_completed_at' => null,
        ]);
        $this->actingAs($user, 'keycloak');

        $this->getJson('/api/v1/onboarding')->assertOk();
    }

    public function test_onboarding_is_reachable_after_program_completed(): void
    {
        $user = User::factory()->create([
            'access_expires_at' => now()->subMonth(),
            'program_completed_at' => now()->subWeek(),
        ]);
        $this->actingAs($user, 'keycloak');

        $this->getJson('/api/v1/onboarding')->assertOk();
    }

    public function test_updated_at_is_exposed_once_content_is_edited(): void
    {
        $this->actingAs(User::factory()->role('super_admin')->create(), 'keycloak');

        $this->patchJson('/api/v1/admin/onboarding', [
            'program' => ['title' => 'T', 'body' => 'B'],
        ])->assertOk();

        $stamp = Setting::query()->where('key', OnboardingContent::KEY)->first()->updated_at;

        $this->getJson('/api/v1/onboarding')
            ->assertOk()
            ->assertJsonPath('data.updated_at', $stamp->toIso8601ZuluString());
    }
}
