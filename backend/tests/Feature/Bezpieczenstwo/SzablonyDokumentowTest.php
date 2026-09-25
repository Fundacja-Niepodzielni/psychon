<?php

namespace Tests\Feature\Bezpieczenstwo;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\ActsAsRole;
use Tests\TestCase;

/**
 * Próby luk z przeglądu ASVS L2 (`docs/bezpieczenstwo/przeglad-asvs-dane.md`),
 * wiersze V5.2.1, V5.2.4, V5.2.5, V5.2.8 i V12.3.6.
 *
 * Wzór dokumentu zapisany z panelu trafia do `Blade::render()`
 * (`app/Services/DocumentTemplates/DocumentTemplateRenderer.php:41`), więc dyrektywy
 * Blade i PHP we wzorze wykonują się na serwerze przy generowaniu dokumentu.
 *
 * Każda próba jest oznaczona jako niedokończona do czasu poprawki. Treść pod
 * znacznikiem opisuje zachowanie oczekiwane po poprawce — po jej wdrożeniu
 * znacznik się usuwa, a próba zostaje testem regresji.
 */
class SzablonyDokumentowTest extends TestCase
{
    use ActsAsRole;
    use RefreshDatabase;

    private const string DOKUMENT = 'docs/bezpieczenstwo/przeglad-asvs-dane.md';

    public function test_wzor_z_dyrektywa_php_jest_odrzucany(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersze V5.2.4, V5.2.5, V5.2.8, V12.3.6: wzór z bazy jest kompilowany jako Blade.');

        $this->actingAsRole('project_manager');

        $this->putJson('/api/v1/document-templates/certificate', [
            'content' => '<p>@php echo 1; @endphp</p>',
        ])->assertStatus(422)->assertJsonPath('error.code', 'validation_failed');
    }

    public function test_wzor_z_surowym_wyjsciem_jest_odrzucany(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersze V5.2.4, V5.2.5, V5.2.8, V12.3.6: wzór może użyć surowego wyjścia i dołączania widoków.');

        $this->actingAsRole('project_manager');

        foreach (['<p>{!! $user !!}</p>', "<p>@include('welcome')</p>"] as $tresc) {
            $this->putJson('/api/v1/document-templates/agreement', ['content' => $tresc])
                ->assertStatus(422)
                ->assertJsonPath('error.code', 'validation_failed');
        }
    }

    public function test_tresc_wzoru_ma_limit_dlugosci_i_jest_sanityzowana(): void
    {
        $this->markTestIncomplete(self::DOKUMENT.', wiersz V5.2.1: treść wzoru nie ma limitu długości ani sanityzacji HTML.');

        $this->actingAsRole('project_manager');

        $this->putJson('/api/v1/document-templates/agreement', [
            'content' => str_repeat('a', 200_001),
        ])->assertStatus(422);

        $this->putJson('/api/v1/document-templates/agreement', [
            'content' => '<p>Umowa</p><script>alert(1)</script>',
        ])->assertOk();

        $this->getJson('/api/v1/document-templates/agreement')
            ->assertOk()
            ->assertDontSee('<script>', false);
    }
}
