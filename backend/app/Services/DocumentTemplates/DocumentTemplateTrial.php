<?php

namespace App\Services\DocumentTemplates;

use App\Support\PdfService;
use Throwable;

/**
 * Próbne generowanie dokumentu z zapisywanej treści wzoru.
 *
 * Reguła pól (`DocumentTemplateFields::violation`) mówi, czego w treści nie wolno
 * napisać. O tym, czy z treści da się zrobić dokument, rozstrzyga silnik: ten
 * sam, tą samą drogą i z tymi samymi ustawieniami, którymi powstaje każdy
 * dokument — z danymi przykładowymi zamiast danych osoby.
 */
final class DocumentTemplateTrial
{
    public const string FAILURE_MESSAGE = 'Z tego wzoru nie da się wygenerować dokumentu. Usuń odwołania do plików i adresów; obrazy tylko osadzone w treści.';

    /**
     * Czy z treści da się wygenerować dokument.
     */
    public static function generates(string $type, string $content): bool
    {
        return self::failure($type, $content) === null;
    }

    /**
     * Powód odmowy do pokazania przy polu treści albo `null`, gdy dokument powstał.
     * Każdy błąd silnika znaczy odmowę; jego treść nie jest ani zwracana, ani
     * zapisywana w dzienniku.
     */
    public static function failure(string $type, string $content): ?string
    {
        try {
            PdfService::bytesFromHtml(
                DocumentTemplateFields::render($type, $content, DocumentTemplateSampleData::for($type)),
                DocumentTemplateSampleData::allowedDataUris($type),
            );

            return null;
        } catch (Throwable) {
            return self::FAILURE_MESSAGE;
        }
    }
}
