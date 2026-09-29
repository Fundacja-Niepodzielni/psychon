<?php

namespace App\Http\Requests\Concerns;

/**
 * Treść lekcji (`content`) zapisuje się dokładnie tak, jak przyszła.
 *
 * Globalne `TrimStrings` przycina każdy string wejścia jeszcze przed
 * walidacją — dla tytułu to pożądane, dla treści w podzbiorze Markdown nie:
 * dwie spacje na końcu wiersza są w niej twardym łamaniem wiersza, a aneks
 * kontraktu obiecuje zapis bez przycinania. Zamiast wyłączać przycinanie
 * globalnie po nazwie pola (to zmieniłoby też inne trasy z polem `content`),
 * żądanie lekcji przywraca wartość z surowego ciała JSON — tylko to jedno
 * pole i tylko wtedy, gdy przyszło jako niepusty string. Pusty string zostaje
 * `null` (jak po `ConvertEmptyStringsToNull`).
 */
trait KeepsLessonContentVerbatim
{
    protected function prepareForValidation(): void
    {
        if (! $this->isJson() || ! $this->has('content')) {
            return;
        }

        $raw = json_decode((string) $this->getContent(), true);

        if (is_array($raw) && is_string($raw['content'] ?? null) && $raw['content'] !== '') {
            $this->merge(['content' => $raw['content']]);
        }
    }
}
