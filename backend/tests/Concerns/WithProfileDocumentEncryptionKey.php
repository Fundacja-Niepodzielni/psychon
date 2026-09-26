<?php

namespace Tests\Concerns;

/**
 * Klucz szyfrowania załączników wniosku H15 (`config('profile_documents.encryption_key')`)
 * jest sekretem tak samo w próbach, jak na produkcji: żaden test nie wpisuje go na
 * stałe. Ten trait generuje go świeżo, w pamięci procesu, na czas pojedynczego testu.
 */
trait WithProfileDocumentEncryptionKey
{
    protected function useFreshProfileDocumentEncryptionKey(): void
    {
        config(['profile_documents.encryption_key' => 'base64:'.base64_encode(random_bytes(32))]);
    }
}
