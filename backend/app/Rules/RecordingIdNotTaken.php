<?php

namespace App\Rules;

use App\Models\Lesson;
use App\Services\Video\VideoProviderId;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Identyfikator nagrania (`video_provider_id`) w żądaniach ADMINISTRACJI: jedno
 * nagranie należy do jednej żywej lekcji. Serwer podpisuje dostęp do nagrania
 * wpisanego w lekcję, a biblioteka nagrań jest jedna — ten sam identyfikator
 * w dwóch lekcjach dawałby dostęp do cudzego nagrania.
 *
 * Wartość NIEZMIENIONA wobec zapisanej w tej lekcji przechodzi zawsze, także
 * gdy identyfikator trzyma już inna lekcja (zastane powtórzenie): edycja
 * tytułu albo opisu nie może się zablokować przez dane sprzed tej reguły.
 * Własna lekcja nie jest więc potrzebna w zapytaniu — jeśli wartość różni się
 * od jej zapisanej, jej wiersz nie może jej zajmować.
 *
 * Lekcje miękko usunięte nie zajmują identyfikatora: `Lesson` ma globalny zakres
 * `SoftDeletes`, a ścieżki przywrócenia usuniętej lekcji nie ma.
 *
 * Reguła sprawdza tylko wartość, która jest poprawnym identyfikatorem
 * (`VideoProviderId::isValid`) — resztę zgłaszają reguły kształtu, a zapytanie
 * nie dostaje tablicy ani napisu spoza wzorca. Pusta wartość (`null`) nie zajmuje
 * niczego, więc reguła jej nie sprawdza (nie jest `implicit`).
 *
 * Porównanie jest bez rozróżniania wielkości liter i bez białych znaków na
 * brzegach (`VideoProviderId::normalize`): zapis zamienia identyfikator na małe
 * litery, więc `MOCK-ABC` i `mock-abc` to to samo nagranie.
 *
 * Sprawdzenie i zapis nie są jedną operacją bazy: dwa równoczesne zapisy tego
 * samego, wolnego jeszcze identyfikatora do dwóch lekcji mogą oba przejść. Wyścig
 * rozstrzyga indeks `lessons_video_provider_id_unique`, a zapis tłumaczy jego
 * naruszenie na tę samą odmowę (`RecordingIdIndex`).
 */
class RecordingIdNotTaken implements ValidationRule
{
    public const string MESSAGE = 'Ten identyfikator nagrania jest już przypisany do innej lekcji.';

    /**
     * @param  string|null  $stored  wartość zapisana w edytowanej lekcji; `null` przy nowej lekcji
     */
    public function __construct(private readonly ?string $stored) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! VideoProviderId::isValid($value)) {
            return;
        }

        $normalized = VideoProviderId::normalize($value);

        if ($normalized === VideoProviderId::normalize($this->stored)) {
            return;
        }

        if (Lesson::query()->whereRaw('lower(video_provider_id) = ?', [$normalized])->exists()) {
            $fail(self::MESSAGE);
        }
    }
}
