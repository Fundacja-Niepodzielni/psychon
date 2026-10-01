<?php

namespace App\Services\DocumentTemplates;

use RuntimeException;

/**
 * Dokument przekracza limit wejścia generowania (`DocumentCostLimit`).
 *
 * Komunikat niesie wyłącznie nazwę przekroczonego limitu — nigdy treść wzoru
 * ani dane osoby.
 */
final class DocumentTooCostly extends RuntimeException
{
    public function __construct(public readonly string $limit)
    {
        parent::__construct('Dokument przekracza limit generowania: '.$limit.'.');
    }
}
