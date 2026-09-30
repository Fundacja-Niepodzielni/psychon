<?php

namespace App\Http\Requests\H08;

use App\Http\Requests\Concerns\KeepsLessonContentVerbatim;
use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /admin/courses/{course}/lessons — nowa lekcja w kursie.
 *
 * `video_provider_id` jest zwykłym polem tekstowym, nie uploadem: kontrakt §4
 * wyłącza prawdziwe Bunny Stream z hackathonu, a odtwarzacz jest mockiem
 * (etykieta w panelu: „Identyfikator nagrania (mock)").
 *
 * Brak `sequence_order` (albo jawny `null`) znaczy „nadaj kolejny wolny numer
 * w kursie" — numerację nadaje `LessonWriter`, bo potrzebuje kontekstu kursu.
 *
 * `topic_id` (opcjonalny) wskazuje temat kursu; bez niego lekcja trafia na
 * koniec ostatniego tematu. Przynależność tematu do kursu sprawdza
 * `LessonWriter`, bo potrzebuje kontekstu kursu.
 *
 * `content` to treść lekcji w podzbiorze Markdown, do 20 000 znaków (nie
 * bajtów). Zapisywana dokładnie tak, jak przyszła: HTML w treści jest
 * tekstem, którego klient nie interpretuje — dlatego nic tu nie jest
 * przycinane ani czyszczone. Trasy prowadzącego dziedziczą tę regułę.
 */
class StoreLessonRequest extends FormRequest
{
    use KeepsLessonContentVerbatim;

    public function authorize(): bool
    {
        return true; // rola sprawdzana przez middleware `role:` na trasie
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'content' => ['sometimes', 'nullable', 'string', 'max:20000'],
            'sequence_order' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'video_provider_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'duration_seconds' => ['sometimes', 'integer', 'min:0'],
            'topic_id' => ['sometimes', 'nullable', 'integer'],
            'topic_position' => ['prohibited'],
        ];
    }

    public function messages(): array
    {
        return [
            'title.required' => 'Podaj tytuł lekcji.',
            'title.max' => 'Tytuł lekcji może mieć najwyżej 255 znaków.',
            'content.string' => 'Treść lekcji musi być tekstem.',
            'content.max' => 'Treść lekcji może mieć najwyżej 20 000 znaków.',
            'sequence_order.min' => 'Pozycja lekcji musi być liczbą co najmniej 1.',
            'video_provider_id.max' => 'Identyfikator nagrania może mieć najwyżej 255 znaków.',
            'duration_seconds.integer' => 'Czas trwania podaj w pełnych sekundach.',
            'duration_seconds.min' => 'Czas trwania nie może być ujemny.',
            'topic_id.integer' => 'Wybierz temat tego kursu.',
            'topic_position.prohibited' => 'Pozycję lekcji w temacie nadaje serwer.',
        ];
    }
}
