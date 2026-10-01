<?php

namespace App\Http\Requests\H08;

use App\Http\Requests\Concerns\KeepsLessonContentVerbatim;
use App\Services\Video\VideoProviderId;
use Illuminate\Foundation\Http\FormRequest;

/**
 * PATCH /admin/lessons/{lesson} — częściowa aktualizacja lekcji. Każde pole
 * z `sometimes`, żeby żądanie zmieniające jedną kolumnę nie wymuszało
 * przesłania całego zasobu.
 *
 * Jawny `null` w `sequence_order` zostawia dotychczasową pozycję: kolumna
 * `lessons.sequence_order` nie jest nullable, a przestawianie kolejności ma
 * własną trasę (faza 4).
 *
 * `topic_id` i `topic_position` są zakazane: układ lekcji w tematach ma
 * jednego pisarza (`PATCH …/topics/reorder`).
 */
class UpdateLessonRequest extends FormRequest
{
    use KeepsLessonContentVerbatim;

    public function authorize(): bool
    {
        return true; // rola sprawdzana przez middleware `role:` na trasie
    }

    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'content' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'sequence_order' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'video_provider_id' => ['sometimes', 'nullable', 'string', 'regex:'.VideoProviderId::PATTERN],
            'duration_seconds' => ['sometimes', 'integer', 'min:0'],
            'topic_id' => ['prohibited'],
            'topic_position' => ['prohibited'],
        ];
    }

    public function messages(): array
    {
        return [
            'title.max' => 'Tytuł lekcji może mieć najwyżej 255 znaków.',
            'content.string' => 'Treść lekcji musi być tekstem.',
            'content.max' => 'Treść lekcji może mieć najwyżej 20 000 znaków.',
            'sequence_order.min' => 'Pozycja lekcji musi być liczbą co najmniej 1.',
            'video_provider_id.regex' => 'Identyfikator nagrania może zawierać tylko litery bez polskich znaków, cyfry i myślniki, razem od 1 do 64 znaków.',
            'duration_seconds.integer' => 'Czas trwania podaj w pełnych sekundach.',
            'duration_seconds.min' => 'Czas trwania nie może być ujemny.',
            'topic_id.prohibited' => 'Temat lekcji zmienia się przez kolejność tematów.',
            'topic_position.prohibited' => 'Temat lekcji zmienia się przez kolejność tematów.',
        ];
    }
}
