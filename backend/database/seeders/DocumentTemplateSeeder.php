<?php

namespace Database\Seeders;

use App\Models\DocumentTemplate;
use App\Models\DocumentTemplateVersion;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

/**
 * Zasilenie poczatkowe edytora wzorow dokumentow: tresc kazdego wzoru to plik
 * z `resources/document-templates/` skopiowany bajt w bajt - tekst z miejscami
 * na pola (`{{ $nazwa }}`), bez skladni szablonu. Generator
 * (`App\Services\DocumentTemplates\DocumentTemplateRenderer`) siega po baze
 * tylko gdy wiersz dla danego rodzaju istnieje; tresci z bazy nie kompiluje,
 * tylko podstawia pola. Dokument z zasilonego wzoru jest taki sam jak z pliku
 * widoku (pilnuje tego proba rownosci).
 *
 * Seeder tylko zaklada brakujace wiersze - istniejacych nie zmienia.
 */
class DocumentTemplateSeeder extends Seeder
{
    /**
     * Rodzaj -> plik wzoru w zapisie pol, z ktorego kopiowana jest tresc poczatkowa.
     *
     * @var array<string, string>
     */
    private const array SOURCE_VIEWS = [
        'agreement' => 'document-templates/agreement.html',
        'attendance_certificate' => 'document-templates/attendance_certificate.html',
        'certificate' => 'document-templates/certificate.html',
    ];

    public function run(): void
    {
        foreach (self::SOURCE_VIEWS as $type => $relativePath) {
            if (DocumentTemplate::query()->where('type', $type)->exists()) {
                continue;
            }

            $content = File::get(resource_path($relativePath));

            // Wzor i jego pierwsza wersja powstaja razem albo wcale. Bez tego blad
            // miedzy nimi zostawilby wzor bez wersji, a kolejny bieg pominalby ten
            // rodzaj (wiersz juz istnieje) i niczego by nie naprawil.
            DB::transaction(static function () use ($type, $content): void {
                $template = DocumentTemplate::create([
                    'type' => $type,
                    'content' => $content,
                    'version' => 1,
                    'updated_by' => null,
                ]);

                DocumentTemplateVersion::create([
                    'document_template_id' => $template->id,
                    'type' => $type,
                    'content' => $content,
                    'version' => 1,
                    'updated_by' => null,
                ]);
            });
        }
    }
}
