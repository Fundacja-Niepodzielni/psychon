<?php

namespace App\Services\DocumentTemplates;

use App\Support\PdfService;
use Throwable;

/**
 * Próbne generowanie dokumentu z treści wzoru — sędzią jest silnik PDF, nie
 * reguła tekstowa.
 *
 * Treść, która spełnia regułę pól, może nadal zawierać coś, na czym silnik się
 * wywraca (na przykład tło wskazujące plik albo adres). Zanim wzór zostanie
 * zapisany, dokument jest więc generowany tym samym silnikiem co prawdziwe
 * dokumenty, z danymi przykładowymi. Wynik próby nie jest nigdzie zapisywany.
 */
final class DocumentTemplateTrial
{
    public const string FAILURE_MESSAGE = 'Z tego wzoru nie da się wygenerować dokumentu. Usuń odwołania do plików i adresów; obrazy tylko osadzone w treści.';

    /**
     * Czy z treści da się wygenerować dokument. Każdy błąd silnika znaczy „nie”;
     * jego treść nie jest ani zwracana, ani zapisywana w dzienniku.
     */
    public static function generates(string $type, string $content): bool
    {
        try {
            PdfService::bytesFromHtml(
                DocumentTemplateFields::render($type, $content, DocumentTemplateSampleData::for($type)),
            );

            return true;
        } catch (Throwable) {
            return false;
        }
    }
}
