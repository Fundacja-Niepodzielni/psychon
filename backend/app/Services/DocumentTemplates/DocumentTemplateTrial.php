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
    public const string FAILURE_MESSAGE = 'Z tego wzoru nie da się wygenerować dokumentu. Wzór nie wczytuje obrazów ani plików — usuń odwołania do adresów. Jedyny obraz w dokumencie to kod QR, który wstawia system.';

    public const string TOO_COSTLY_MESSAGE = 'Wzór jest zbyt złożony, żeby wygenerować z niego dokument: ma za dużo elementów, zbyt głębokie zagnieżdżenie, zbyt duże scalenie komórek tabeli albo za dużo stron.';

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
        } catch (DocumentTooCostly) {
            return self::TOO_COSTLY_MESSAGE;
        } catch (Throwable) {
            return self::FAILURE_MESSAGE;
        }
    }
}
