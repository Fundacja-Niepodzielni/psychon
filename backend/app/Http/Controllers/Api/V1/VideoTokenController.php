<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Lesson;
use App\Services\Lessons\LessonAccess;
use App\Services\Video\LessonRecording;
use App\Services\Video\VideoTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Wydanie podpisanego linku do nagrania lekcji.
 *
 * Dostęp sprawdzany PRZY WYDANIU linku regułą `LessonAccess::authorizeRecording`:
 * kurs poza katalogiem wywołującego (także personelu) odpowiada tak, jakby nie
 * istniał, zanim dojdzie do sprawdzenia kolejności kursów w ścieżce.
 *
 * Link dotyczy wyłącznie nagrania ODTWARZANEGO i jest wydawany, gdy da się je
 * odtworzyć (`LessonRecording::hasPlayable`): stan „gotowe” albo „nieznany”,
 * także w czasie wymiany nagrania — wtedy uczestnik dostaje dotychczasowe.
 * Lekcja, która ma nagranie, ale żadnego gotowego (wysyłane, przetwarzane,
 * z błędem), odpowiada `404 video_not_ready`; lekcja bez nagrania — jak dotąd
 * `404 video_missing`. Oba przypadki mają ten sam status i różnią się kodem.
 * Trasa nie pyta dostawcy: stan pochodzi z bazy.
 *
 * Odpowiedź niesie pięć pól: `url` (lista odtwarzania), `expires_at`,
 * `video_id` oraz `embed_url` (podpisany adres ramki odtwarzacza) i
 * `embed_expires_at` — oba adresy wygasają o tej samej chwili (czas uniksowy).
 */
class VideoTokenController extends Controller
{
    public function __construct(
        private readonly VideoTokenService $tokenService,
        private readonly LessonAccess $lessonAccess,
    ) {}

    public function show(Request $request, Lesson $lesson): JsonResponse
    {
        $user = $request->user();
        $this->lessonAccess->authorizeRecording($user, $lesson);

        // Konfiguracja podpisu jest sprawdzana dopiero po rozstrzygnięciu
        // dostępu: lekcja niewidoczna dla osoby odpowiada tak jak nieistniejąca.
        if (! $this->tokenService->isConfigured()) {
            throw new ApiException(
                503,
                'video_not_configured',
                'Odtwarzanie wideo jest chwilowo niedostępne. Spróbuj ponownie później.',
            );
        }

        $recording = LessonRecording::of($lesson);

        if ($recording->newestId() === null) {
            throw new ApiException(404, 'video_missing', 'Ta lekcja nie ma jeszcze przypisanego nagrania.');
        }

        if (! $recording->hasPlayable()) {
            throw new ApiException(404, 'video_not_ready', 'Nagranie w przygotowaniu.');
        }

        return response()->json(['data' => $this->tokenService->signedPlayback($lesson, $user)]);
    }
}
