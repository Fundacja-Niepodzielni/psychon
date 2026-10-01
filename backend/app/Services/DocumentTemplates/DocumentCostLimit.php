<?php

namespace App\Services\DocumentTemplates;

use DOMElement;
use DOMNode;
use Dompdf\Dompdf;

/**
 * Limit wejścia jednego generowania dokumentu.
 *
 * Twardego limitu czasu środowisko żądań nie daje bez zatrzymania całego procesu,
 * a najdroższe zmierzone wejście (scalenie komórek tabeli 65 000 × 65 000) kończy
 * się wyczerpaniem pamięci w sekundę — błędem, którego nie da się złapać. Dlatego
 * koszt jest ograniczany PRZED renderem, na drzewie zbudowanym przez sam silnik
 * (atrybut zapisany encjami liczy się tak samo jak zapisany wprost), a liczba
 * stron — w trakcie układania, na pierwszej stronie ponad limit.
 *
 * Wartości z pomiaru: trzy wzory z repozytorium mają do 60 elementów, głębokość
 * do 7 i jedną stronę; wzór dziesięć razy większy mieści się w limitach z zapasem.
 */
final class DocumentCostLimit
{
    /** Elementy drzewa dokumentu. */
    public const int MAX_ELEMENTS = 2000;

    /** Głębokość zagnieżdżenia elementów. */
    public const int MAX_DEPTH = 40;

    /** Największa wartość `colspan` albo `rowspan` jednej komórki. */
    public const int MAX_SPAN = 50;

    /** Suma pól (`colspan` × `rowspan`) wszystkich scalonych komórek dokumentu. */
    public const int MAX_SPAN_AREA = 2000;

    /** Strony dokumentu. */
    public const int MAX_PAGES = 40;

    /**
     * Sprawdza drzewo wczytanego dokumentu i zakłada licznik stron na render.
     *
     * @throws DocumentTooCostly
     */
    public static function guard(Dompdf $engine): void
    {
        $measure = self::measure($engine->getDom()->documentElement);

        if ($measure['exceeded'] !== null) {
            throw new DocumentTooCostly($measure['exceeded']);
        }

        $pages = 0;

        $engine->setCallbacks([[
            'event' => 'begin_page_reflow',
            'f' => static function () use (&$pages): void {
                if (++$pages > self::MAX_PAGES) {
                    throw new DocumentTooCostly('pages');
                }
            },
        ]]);
    }

    /**
     * Przejście po drzewie bez rekurencji; kończy się na pierwszym przekroczeniu.
     *
     * @return array{elements: int, depth: int, span_area: int, exceeded: string|null}
     */
    public static function measure(?DOMNode $root): array
    {
        $elements = 0;
        $deepest = 0;
        $spanArea = 0;

        $stack = [];

        if ($root !== null) {
            $stack[] = [$root, 1];
        }

        while ($stack !== []) {
            [$node, $depth] = array_pop($stack);

            if ($node instanceof DOMElement) {
                $elements++;
                $deepest = max($deepest, $depth);

                $columns = max(1, (int) $node->getAttribute('colspan'));
                $rows = max(1, (int) $node->getAttribute('rowspan'));

                if ($columns > 1 || $rows > 1) {
                    $spanArea += min($columns, self::MAX_SPAN + 1) * min($rows, self::MAX_SPAN + 1);
                }

                $exceeded = match (true) {
                    $elements > self::MAX_ELEMENTS => 'elements',
                    $depth > self::MAX_DEPTH => 'depth',
                    $columns > self::MAX_SPAN || $rows > self::MAX_SPAN, $spanArea > self::MAX_SPAN_AREA => 'span',
                    default => null,
                };

                if ($exceeded !== null) {
                    return ['elements' => $elements, 'depth' => $deepest, 'span_area' => $spanArea, 'exceeded' => $exceeded];
                }
            }

            for ($child = $node->lastChild; $child !== null; $child = $child->previousSibling) {
                $stack[] = [$child, $depth + 1];
            }
        }

        return ['elements' => $elements, 'depth' => $deepest, 'span_area' => $spanArea, 'exceeded' => null];
    }
}
