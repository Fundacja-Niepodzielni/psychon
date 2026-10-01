<?php

namespace App\Services\H08;

use App\Exceptions\ApiException;
use App\Rules\RecordingIdNotTaken;
use Illuminate\Database\UniqueConstraintViolationException;
use Throwable;

/**
 * Indeks częściowy `lessons_video_provider_id_unique` (migracja
 * `2026_10_01_205639_add_unique_recording_id_index_to_lessons`): jedno nagranie
 * należy do jednej żywej lekcji, bez rozróżniania wielkości liter.
 *
 * Reguła żądania sprawdza wolność identyfikatora przed zapisem, a indeks
 * rozstrzyga wyścig dwóch równoczesnych zapisów. Naruszenie TEGO indeksu
 * tłumaczy się na odmowę zamiast błędu serwera. Rozpoznanie idzie po NAZWIE
 * indeksu, nie po samym kodzie błędu bazy: naruszenie innego indeksu lekcji
 * (np. kolejności `lessons_course_sequence_unique`) zostaje błędem, jakim było,
 * i nie jest nazywane zajętym nagraniem.
 */
final class RecordingIdIndex
{
    public const string NAME = 'lessons_video_provider_id_unique';

    /**
     * Czy to wyjątek z naruszenia indeksu niepowtarzalności nagrania.
     */
    public static function isViolatedBy(Throwable $e): bool
    {
        return $e instanceof UniqueConstraintViolationException
            && str_contains($e->getMessage(), '"'.self::NAME.'"');
    }

    /**
     * Odmowa zapisu lekcji: ten sam kształt i to samo zdanie co odmowa reguły
     * `RecordingIdNotTaken`.
     */
    public static function refusal(): ApiException
    {
        return new ApiException(422, 'validation_failed', 'Popraw zaznaczone pola.', errors: [
            'video_provider_id' => [RecordingIdNotTaken::MESSAGE],
        ]);
    }
}
