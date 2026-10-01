<?php

namespace Tests\Feature\DocumentTemplates;

use App\Models\DocumentTemplate;
use App\Models\DocumentTemplateVersion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * Krok potoku wdrozeniowego `php artisan db:seed --class=DocumentTemplateSeeder
 * --force` biegnie przy KAZDYM wdrozeniu, wiec seeder musi byc bezpieczny przy
 * powtorzeniu: pusta tabela dostaje trzy wzory, drugi bieg niczego nie dodaje,
 * a wzor zmieniony juz w edytorze zostaje nietkniety. Proby wolaja dokladnie to
 * polecenie, ktore stoi w `deploy/psychon-dev/deploy.sh`.
 */
class DocumentTemplateSeederIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private const array TYPES = ['agreement', 'attendance_certificate', 'certificate'];

    private function runPipelineStep(): int
    {
        return Artisan::call('db:seed', [
            '--class' => 'DocumentTemplateSeeder',
            '--force' => true,
        ]);
    }

    public function test_empty_table_gets_three_templates_and_a_second_run_keeps_three(): void
    {
        $this->assertSame(0, DocumentTemplate::query()->count());
        $this->assertSame(0, DocumentTemplateVersion::query()->count());

        $this->assertSame(0, $this->runPipelineStep());

        $this->assertSame(3, DocumentTemplate::query()->count());
        $this->assertSame(3, DocumentTemplateVersion::query()->count());
        $this->assertEqualsCanonicalizing(
            self::TYPES,
            DocumentTemplate::query()->pluck('type')->all(),
        );

        $before = DocumentTemplate::query()->orderBy('id')->get(['id', 'type', 'content', 'version', 'updated_at'])->toArray();

        $this->assertSame(0, $this->runPipelineStep());

        $this->assertSame(3, DocumentTemplate::query()->count());
        $this->assertSame(3, DocumentTemplateVersion::query()->count());
        $this->assertSame(
            $before,
            DocumentTemplate::query()->orderBy('id')->get(['id', 'type', 'content', 'version', 'updated_at'])->toArray(),
        );
    }

    public function test_existing_template_with_own_content_is_not_overwritten(): void
    {
        $own = DocumentTemplate::create([
            'type' => 'agreement',
            'content' => 'Tresc wzoru zmieniona w edytorze.',
            'version' => 2,
            'updated_by' => null,
        ]);
        DocumentTemplateVersion::create([
            'document_template_id' => $own->id,
            'type' => 'agreement',
            'content' => 'Tresc wzoru zmieniona w edytorze.',
            'version' => 2,
            'updated_by' => null,
        ]);
        $ownBefore = DocumentTemplate::query()->findOrFail($own->id)->only(['content', 'version', 'updated_at']);

        $this->assertSame(0, $this->runPipelineStep());

        $ownAfter = DocumentTemplate::query()->findOrFail($own->id);
        $this->assertSame($ownBefore['content'], $ownAfter->content);
        $this->assertSame($ownBefore['version'], $ownAfter->version);
        $this->assertEquals($ownBefore['updated_at'], $ownAfter->updated_at);
        $this->assertSame(1, DocumentTemplate::query()->where('type', 'agreement')->count());
        $this->assertSame(1, DocumentTemplateVersion::query()->where('type', 'agreement')->count());

        // Dwa brakujace rodzaje dochodza, istniejacy zostaje jeden.
        $this->assertSame(3, DocumentTemplate::query()->count());
        $this->assertSame(3, DocumentTemplateVersion::query()->count());
    }
}
