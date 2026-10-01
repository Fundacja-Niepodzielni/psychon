<?php

namespace App\Services\Video;

use App\Models\Lesson;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Odświeżenie stanu nagrania jednej lekcji u dostawcy — JEDYNE miejsce, które
 * pyta dostawcę o stan, wołane wyłącznie z trasy odczytu stanu nagrania.
 *
 * Kiedy pyta:
 *  - tylko dla stanów „wysyłanie”, „przetwarzanie” i „nieznany”
 *    (`LessonRecording::asksProvider`); „gotowe”, „błąd” i brak nagrania nie
 *    pytają nigdy;
 *  - nie częściej niż raz na `services.bunny.status_refresh_seconds` na lekcję.
 *    Próg i równoległość rozstrzyga jeden atomowy zapis w pamięci podręcznej
 *    (`Cache::add`): z dwóch równoczesnych odczytów tej samej lekcji pyta
 *    jeden, drugi dostaje stan z bazy.
 *
 * Co zapisuje:
 *  - błąd albo brak odpowiedzi dostawcy niczego nie zmienia — ani stanu, ani
 *    czasu stanu;
 *  - stan nagrania „w drodze” zmienia się na odczytany; odczyt, który pierwszy
 *    zobaczył „gotowe”, w TEJ SAMEJ transakcji robi z niego nagranie
 *    odtwarzane (podmiana) — nigdy wcześniej;
 *  - błąd nagrania „w drodze” nie rusza nagrania odtwarzanego.
 *
 * Czas stanu (`video_status_at`) zmienia się tylko razem ze stanem: dopóki
 * nagranie jest „wysyłane”, czas stanu jest chwilą założenia nagrania (od niej
 * liczy się okno wznowienia wysyłki).
 */
class RecordingStateRefresher
{
    public const int DEFAULT_REFRESH_SECONDS = 30;

    /**
     * Odświeża stan lekcji, jeśli wolno. Zwraca czas trwania nagrania podany
     * przez dostawcę w TYM odczycie (sekundy) albo `null`, gdy dostawcy nie
     * pytano albo nie odpowiedział.
     */
    public function refresh(Lesson $lesson): ?int
    {
        $recording = LessonRecording::of($lesson);
        $askedId = $recording->newestId();

        if ($askedId === null || ! $recording->asksProvider()) {
            return null;
        }

        if (! Cache::add($this->throttleKey($lesson), true, $this->refreshSeconds())) {
            return null;
        }

        $payload = $this->read($askedId);

        if ($payload === null) {
            return null;
        }

        $providerStatus = $payload['status'] ?? null;

        if (! RecordingStatus::isKnownProviderRead($providerStatus)) {
            // Bez identyfikatora nagrania i lekcji: dziennik ma powiedzieć, że
            // tabela stanów wymaga uzupełnienia, a nie czyje to nagranie.
            Log::warning('Dostawca nagrań zwrócił stan spoza tabeli — przyjęto „przetwarzanie”.', [
                'provider_status' => is_scalar($providerStatus) ? (string) $providerStatus : gettype($providerStatus),
            ]);
        }

        $length = max(0, (int) ($payload['length'] ?? 0));

        $this->apply($lesson, $askedId, RecordingStatus::fromProviderRead($providerStatus), $length);

        return $length;
    }

    public function refreshSeconds(): int
    {
        $seconds = (int) config('services.bunny.status_refresh_seconds', self::DEFAULT_REFRESH_SECONDS);

        return $seconds > 0 ? $seconds : self::DEFAULT_REFRESH_SECONDS;
    }

    /**
     * Odczyt nagrania u dostawcy. `null` = błąd albo brak odpowiedzi.
     *
     * @return array<string, mixed>|null
     */
    private function read(string $videoId): ?array
    {
        $libraryId = (string) config('services.bunny.library_id');
        $apiKey = (string) config('services.bunny.api_key');
        $segment = VideoProviderId::segment($videoId);

        try {
            $response = Http::withHeaders(['AccessKey' => $apiKey])
                ->get("https://video.bunnycdn.com/library/{$libraryId}/videos/{$segment}");
        } catch (ConnectionException) {
            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        $payload = $response->json();

        return is_array($payload) ? $payload : null;
    }

    private function apply(Lesson $lesson, string $askedId, string $status, int $length): void
    {
        DB::transaction(function () use ($lesson, $askedId, $status, $length): void {
            $fresh = Lesson::query()->whereKey($lesson->getKey())->lockForUpdate()->first();

            if ($fresh === null) {
                return;
            }

            $recording = LessonRecording::of($fresh);

            // Między odczytem a zapisem ktoś rozpoczął nowe wgranie albo zmienił
            // nagranie: odpowiedź dotyczy już innego nagrania niż najnowsze.
            if ($recording->newestId() !== $askedId) {
                return;
            }

            if ($recording->hasPending()) {
                $this->applyToPending($fresh, $recording, $status, $length);
            } elseif ($status !== $recording->status()) {
                $fresh->video_status = $status;
                $fresh->video_status_at = now();

                if ($status === RecordingStatus::READY && $length > 0 && (int) $fresh->duration_seconds === 0) {
                    $fresh->duration_seconds = $length;
                }
            }

            $fresh->save();
        });

        $lesson->refresh();
    }

    private function applyToPending(Lesson $fresh, LessonRecording $recording, string $status, int $length): void
    {
        if ($status !== RecordingStatus::READY) {
            if ($status !== $recording->status()) {
                $fresh->video_status = $status;
                $fresh->video_status_at = now();
            }

            return;
        }

        // Nagranie gotowe, ale jego identyfikator jest już odtwarzany w innej
        // żywej lekcji: podmiana dałaby dwóm lekcjom jedno nagranie.
        if ($this->playedElsewhere($fresh, (string) $recording->pendingId)) {
            Log::warning('Gotowe nagranie ma identyfikator odtwarzany w innej lekcji — podmiana wstrzymana.');
            $fresh->video_status = RecordingStatus::ERROR;
            $fresh->video_status_at = now();

            return;
        }

        $fresh->video_provider_id = $recording->pendingId;
        $fresh->video_pending_id = null;
        $fresh->video_status = RecordingStatus::READY;
        $fresh->video_status_at = now();

        if ($length > 0) {
            $fresh->duration_seconds = $length;
        }
    }

    private function playedElsewhere(Lesson $lesson, string $videoId): bool
    {
        return Lesson::query()
            ->whereKeyNot($lesson->getKey())
            ->whereRaw('lower(video_provider_id) = ?', [strtolower($videoId)])
            ->exists();
    }

    private function throttleKey(Lesson $lesson): string
    {
        return 'lesson-recording-state-check:'.$lesson->getKey();
    }
}
