<?php

namespace App\Rules;

use App\Models\Lesson;
use App\Services\Video\VideoProviderId;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Identyfikator nagrania (`video_provider_id`) w żądaniach ADMINISTRACJI nie
 * może być nagraniem „w drodze” (`video_pending_id`) INNEJ żywej lekcji.
 *
 * Każda z dwóch kolumn ma własną niepowtarzalność; ta reguła pilnuje jej
 * MIĘDZY kolumnami od strony zapisu lekcji (od strony wgrania pilnuje jej
 * `BunnyVideoAdminController`). Bez niej nagranie wysyłane do jednej lekcji
 * dałoby się wpisać ręcznie jako odtwarzane w drugiej — a po gotowości obie
 * lekcje dawałyby dostęp do tego samego nagrania.
 *
 * Porównanie bez rozróżniania wielkości liter i bez białych znaków na
 * brzegach. Własna lekcja nie jest sprawdzana; lekcja usunięta miękko nie
 * zajmuje identyfikatora (globalny zakres `SoftDeletes`). Zdanie odmowy jest
 * to samo co w `RecordingIdNotTaken` — nie ujawnia, w której kolumnie stoi
 * identyfikator.
 */
class RecordingIdNotOnItsWay implements ValidationRule
{
    /**
     * @param  int|null  $lessonId  edytowana lekcja; `null` przy nowej lekcji
     */
    public function __construct(private readonly ?int $lessonId) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! VideoProviderId::isValid($value)) {
            return;
        }

        $query = Lesson::query()->whereRaw('lower(video_pending_id) = ?', [VideoProviderId::normalize($value)]);

        if ($this->lessonId !== null) {
            $query->whereKeyNot($this->lessonId);
        }

        if ($query->exists()) {
            $fail(RecordingIdNotTaken::MESSAGE);
        }
    }
}
