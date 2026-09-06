<?php

namespace Tests\Feature\H21;

use App\Models\Setting;
use App\Models\User;
use App\Support\OnboardingContent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
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

    public function test_get_onboarding_returns_default_content_when_nothing_is_stored(): void
    {
        Sanctum::actingAs(User::factory()->create());

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
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/v1/onboarding')
            ->assertOk()
            ->assertJsonPath('data.program.title', 'Plan')
            ->assertJsonPath('data.program.body', 'Treść planu.')
            // sekcje nietknięte zostają na wartościach domyślnych
            ->assertJsonPath('data.expectations.title', OnboardingContent::DEFAULTS['expectations']['title']);
    }

    public function test_admin_updates_content_and_it_is_visible_immediately(): void
    {
        Sanctum::actingAs(User::factory()->role('project_manager')->create());

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
        Sanctum::actingAs(User::factory()->role('super_admin')->create());

        $this->patchJson('/api/v1/admin/onboarding', [
            'expectations' => ['title' => 'Zasady', 'body' => 'Bądź rzetelny.'],
        ])->assertOk();

        $this->assertSame('Zasady', OnboardingContent::get()['expectations']['title']);
    }

    public function test_volunteer_cannot_update_content(): void
    {
        Sanctum::actingAs(User::factory()->role('volunteer')->create());

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
        Sanctum::actingAs(User::factory()->role('project_manager')->create());

        $this->patchJson('/api/v1/admin/onboarding', [
            'program' => ['title' => ''],
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['errors' => ['program.title', 'program.body']]]);
    }

    public function test_update_rejects_an_invalid_video_url(): void
    {
        Sanctum::actingAs(User::factory()->role('project_manager')->create());

        $this->patchJson('/api/v1/admin/onboarding', [
            'video' => ['title' => 'Film', 'url' => 'not-a-url'],
        ])
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_onboarding_is_reachable_after_access_expired(): void
    {
        $user = User::factory()->create([
            'access_expires_at' => now()->subDay(),
            'program_completed_at' => null,
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/onboarding')->assertOk();
    }

    public function test_onboarding_is_reachable_after_program_completed(): void
    {
        $user = User::factory()->create([
            'access_expires_at' => now()->subMonth(),
            'program_completed_at' => now()->subWeek(),
        ]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/onboarding')->assertOk();
    }

    public function test_updated_at_is_exposed_once_content_is_edited(): void
    {
        Sanctum::actingAs(User::factory()->role('super_admin')->create());

        $this->patchJson('/api/v1/admin/onboarding', [
            'program' => ['title' => 'T', 'body' => 'B'],
        ])->assertOk();

        $stamp = Setting::query()->where('key', OnboardingContent::KEY)->first()->updated_at;

        $this->getJson('/api/v1/onboarding')
            ->assertOk()
            ->assertJsonPath('data.updated_at', $stamp->toIso8601ZuluString());
    }
}
