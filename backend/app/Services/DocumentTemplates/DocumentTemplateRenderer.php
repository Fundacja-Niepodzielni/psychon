<?php

namespace App\Services\DocumentTemplates;

use App\Models\DocumentTemplate;
use Illuminate\Support\Facades\Blade;

/**
 * Jedyne miejsce, w ktorym generator dokumentow (`App\Support\PdfService`)
 * decyduje, skad wziac HTML wzoru: z bazy (`document_templates`), gdy dla
 * danego widoku Blade istnieje edytowalny wzor, albo z pliku - dotychczasowe
 * zachowanie - gdy wpisu nie ma. Mapa widok -> rodzaj jest zamknieta: rodzaje
 * spoza `DocumentTemplate::TYPES` nigdy nie trafiaja do bazy.
 */
final class DocumentTemplateRenderer
{
    /**
     * @var array<string, string>
     */
    private const array TYPES_BY_VIEW = [
        'documents.volunteer-agreement' => 'agreement',
        'documents.internship-certificate' => 'attendance_certificate',
        'pdf.certificate' => 'certificate',
    ];

    /**
     * @param  array<string, mixed>  $data
     */
    public static function html(string $view, array $data): string
    {
        $type = self::TYPES_BY_VIEW[$view] ?? null;

        $template = $type !== null
            ? DocumentTemplate::query()->where('type', $type)->first()
            : null;

        if ($template === null) {
            return view($view, $data)->render();
        }

        return Blade::render($template->content, $data);
    }
}
