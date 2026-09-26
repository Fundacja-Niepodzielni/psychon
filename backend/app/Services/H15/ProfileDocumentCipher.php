<?php

namespace App\Services\H15;

use App\Exceptions\ProfileDocumentEncryptionKeyMissingException;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Encryption\Encrypter;

/**
 * Szyfrowanie i odszyfrowanie treści załączników wniosku o wpis do bazy
 * psychologów (H15). Osobny klucz od `APP_KEY` — patrz
 * komentarz w `config/profile_documents.php`.
 *
 * Klucz czytamy raz, w konstruktorze, żeby brak konfiguracji ujawnił się
 * jednym, nazwanym wyjątkiem w miejscu wywołania (zapis albo odczyt), a nie
 * dopiero głęboko w szyfratorze Laravela generycznym `RuntimeException`.
 */
class ProfileDocumentCipher
{
    private readonly Encrypter $encrypter;

    public function __construct(?string $key = null)
    {
        $key ??= config('profile_documents.encryption_key');

        if (blank($key)) {
            throw new ProfileDocumentEncryptionKeyMissingException;
        }

        $this->encrypter = new Encrypter(self::decodeKey($key), 'aes-256-cbc');
    }

    /**
     * Zwraca szyfrogram (payload Laravela: iv + mac + value, base64+JSON) —
     * to jest dokładnie to, co ląduje na dysku. `serialize: false`, bo
     * szyfrujemy surowe bajty pliku, nie wartość PHP.
     */
    public function encrypt(string $plainContent): string
    {
        return $this->encrypter->encrypt($plainContent, serialize: false);
    }

    /**
     * @throws DecryptException gdy zawartość nie jest szyfrogramem tego klucza
     */
    public function decrypt(string $encryptedContent): string
    {
        return $this->encrypter->decrypt($encryptedContent, unserialize: false);
    }

    private static function decodeKey(string $key): string
    {
        if (str_starts_with($key, 'base64:')) {
            $decoded = base64_decode(substr($key, 7), strict: true);

            if ($decoded !== false) {
                return $decoded;
            }
        }

        return $key;
    }
}
