<?php

namespace App\Services\DocumentTemplates;

use App\Models\DocumentTemplate;
use InvalidArgumentException;

/**
 * Jedyne miejsce, w ktorym generator dokumentow (`App\Support\PdfService`)
 * decyduje, skad wziac HTML wzoru: z bazy (`document_templates`), gdy dla
 * danego widoku istnieje edytowalny wzor, albo z pliku - gdy wpisu nie ma.
 * Mapa widok -> rodzaj jest zamknieta: rodzaje spoza `DocumentTemplate::TYPES`
 * nigdy nie trafiaja do bazy.
 *
 * Tresc z bazy NIE jest kompilowana ani wykonywana: pola podstawia zwykla
 * zamiana tekstu (`DocumentTemplateFields::render`). Tresc z bazy, ktora
 * zawiera cokolwiek poza dozwolonymi miejscami na pola (na przyklad wersja
 * zapisana, zanim ta regula powstala), nie jest ani wykonywana, ani wypisywana
 * do dokumentu - generator bierze wtedy wzor z pliku w repozytorium, tak jak
 * przy braku wiersza. Kompilowane sa wylacznie pliki widokow z repozytorium,
 * wskazane ponizej literalami.
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
        return self::storedHtml($view, $data)['html'] ?? self::fileHtml($view, $data);
    }

    /**
     * HTML z tresci wzoru w bazie razem z tym, co wolno o nim zapisac w dzienniku
     * (rodzaj i numer wersji) - albo `null`, gdy dokument ma powstac z pliku:
     * wiersza nie ma albo jego tresc ma stary zapis.
     *
     * @param  array<string, mixed>  $data
     * @return array{type: string, version: int, html: string}|null
     */
    public static function storedHtml(string $view, array $data): ?array
    {
        $type = self::TYPES_BY_VIEW[$view] ?? null;

        if ($type === null) {
            throw new InvalidArgumentException('Nieznany widok dokumentu.');
        }

        $template = DocumentTemplate::query()->where('type', $type)->first();

        if ($template === null || self::ignoresStoredContent($type, $template->content)) {
            return null;
        }

        return [
            'type' => $type,
            'version' => (int) $template->version,
            'html' => DocumentTemplateFields::render($type, $template->content, $data),
        ];
    }

    /**
     * Czy tresc z bazy jest pomijana, a dokument powstaje z pliku w repozytorium.
     *
     * Jedno zrodlo prawdy: tym samym warunkiem generator wybiera plik, a odczyt
     * wzoru ustawia znacznik `current_version_unused`.
     */
    public static function ignoresStoredContent(string $type, string $content): bool
    {
        return DocumentTemplateFields::violation($type, $content) !== null;
    }

    /**
     * Wzor z pliku w repozytorium (zaufany kod). Nazwy widokow sa literalami,
     * zeby do kompilatora szablonow nie trafila zadna nazwa z zewnatrz.
     *
     * @param  array<string, mixed>  $data
     */
    public static function fileHtml(string $view, array $data): string
    {
        return match ($view) {
            'documents.volunteer-agreement' => view('documents.volunteer-agreement', $data)->render(),
            'documents.internship-certificate' => view('documents.internship-certificate', $data)->render(),
            'pdf.certificate' => view('pdf.certificate', $data)->render(),
            default => throw new InvalidArgumentException('Nieznany widok dokumentu.'),
        };
    }
}
