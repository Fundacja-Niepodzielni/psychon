<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Lesson;
use App\Services\Lessons\LessonAccess;
use App\Services\Video\VideoTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Wydanie podpisanego linku do nagrania lekcji.
 *
 * Dostęp sprawdzany PRZY WYDANIU linku regułą `LessonAccess::authorizeRecording`:
 * kurs poza katalogiem wywołującego (także personelu) odpowiada tak, jakby nie
 * istniał, zanim dojdzie do sprawdzenia kolejności kursów w ścieżce.
 */
class VideoTokenController extends Controller
{
    public function __construct(
        private readonly VideoTokenService $tokenService,
        private readonly LessonAccess $lessonAccess,
    ) {}

    public function show(Request $request, Lesson $lesson): JsonResponse
    {
        if (! $this->tokenService->isConfigured()) {
            throw new ApiException(
                503,
                'video_not_configured',
                'Odtwarzanie wideo jest chwilowo niedostępne. Spróbuj ponownie później.',
            );
        }

        $user = $request->user();
        $this->lessonAccess->authorizeRecording($user, $lesson);

        if ($lesson->video_provider_id === null) {
            throw new ApiException(404, 'video_missing', 'Ta lekcja nie ma jeszcze przypisanego nagrania.');
        }

        return response()->json(['data' => $this->tokenService->signedCdnUrl($lesson, $user)]);
    }
}
