<?php

namespace App\Exceptions;

use App\Services\H15\ProfileDocumentCipher;

/**
 * Załączniki wniosku H15 zapisujemy i czytamy przez
 * {@see ProfileDocumentCipher}, który zawsze wymaga klucza
 * z `config('profile_documents.encryption_key')`. Brak wartości tej zmiennej
 * środowiskowej nie ma prawa skończyć się generycznym `RuntimeException`
 * szyfratora Laravela ani — gorzej — cichym zapisem jawnym: dostaje własną
 * nazwę, którą można złapać i rozpoznać w dzienniku bez czytania treści
 * komunikatu.
 *
 * Komunikat nazywa WYŁĄCZNIE nazwę zmiennej środowiskowej, nigdy jej wartość.
 */
final class ProfileDocumentEncryptionKeyMissingException extends ApiException
{
    public function __construct()
    {
        parent::__construct(
            500,
            'profile_document_encryption_key_missing',
            'Brak klucza szyfrowania załączników wniosku (zmienna środowiskowa NP_PROFILE_DOCUMENT_ENCRYPTION_KEY) w konfiguracji.',
        );
    }
}
