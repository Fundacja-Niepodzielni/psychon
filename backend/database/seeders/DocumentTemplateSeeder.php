<?php

namespace Database\Seeders;

use App\Models\DocumentTemplate;
use App\Models\DocumentTemplateVersion;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;

/**
 * Zasilenie poczatkowe edytora wzorow dokumentow: tresc kazdego wzoru to
 * dzisiejszy plik Blade skopiowany bajt w bajt z dysku. Generator
 * (`App\Services\DocumentTemplates\DocumentTemplateRenderer`) siega po baze
 * tylko gdy wiersz dla danego rodzaju istnieje - do czasu tego seeda dalej
 * czyta plik, po nim czyta identyczna tresc z bazy, wiec wygenerowany
 * dokument sie nie zmienia.
 */
class DocumentTemplateSeeder extends Seeder
{
    /**
     * Rodzaj -> plik Blade, z ktorego kopiowana jest tresc poczatkowa.
     *
     * @var array<string, string>
     */
    private const array SOURCE_VIEWS = [
        'agreement' => 'documents/volunteer-agreement.blade.php',
        'attendance_certificate' => 'documents/internship-certificate.blade.php',
        'certificate' => 'pdf/certificate.blade.php',
    ];

    public function run(): void
    {
        foreach (self::SOURCE_VIEWS as $type => $relativePath) {
            if (DocumentTemplate::query()->where('type', $type)->exists()) {
                continue;
            }

            $content = File::get(resource_path('views/'.$relativePath));

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
        }
    }
}
