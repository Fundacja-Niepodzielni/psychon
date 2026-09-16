<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Lesson;
use App\Queries\CourseCatalogQuery;
use App\Services\Auth\TokenRoles;
use App\Services\Video\VideoTokenService;
use App\Support\CourseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Wydanie podpisanego linku do nagrania lekcji.
 *
 * Widoczność sprawdzana PRZY WYDANIU linku, tym samym zapytaniem co
 * katalog kursów (`CourseCatalogQuery::visibleTo`, budowane z ról bieżącego
 * tokena) — kurs poza zasięgiem wywołującego odpowiada tak, jakby nie
 * istniał, zanim jeszcze dojdzie do sprawdzenia sekwencyjnej blokady
 * (`CourseAccess::state`, ten sam bramkarz co `h06.php`; inny plik trasy
 * nie może go zaimportować z h06, więc powtarza te same dwie linijki, nie
 * nowy mechanizm).
 */
class VideoTokenController extends Controller
{
    public function __construct(private readonly VideoTokenService $tokenService) {}

    public function show(Request $request, Lesson $lesson, TokenRoles $tokenRoles): JsonResponse
    {
        if (! $this->tokenService->isConfigured()) {
            throw new ApiException(
                503,
                'video_not_configured',
                'Odtwarzanie wideo jest chwilowo niedostępne. Spróbuj ponownie później.',
            );
        }

        $lesson->loadMissing('course');
        $course = $lesson->course;

        if (! $course instanceof Course) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zasobu.');
        }

        $user = $request->user();
        $roles = $tokenRoles->current();
        $visible = CourseCatalogQuery::visibleTo($user, $roles)->whereKey($course->id)->exists();

        if (! $visible) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zasobu.');
        }

        $state = CourseAccess::state($user, $course);

        if ($state['status'] === 'locked') {
            throw new ApiException(
                403,
                'course_locked',
                'Ten kurs jest jeszcze zablokowany.',
                reason: [
                    'required_course_id' => $state['required_course_id'] ?? null,
                    'missing' => $state['missing'],
                ],
            );
        }

        if ($lesson->video_provider_id === null) {
            throw new ApiException(404, 'video_missing', 'Ta lekcja nie ma jeszcze przypisanego nagrania.');
        }

        return response()->json(['data' => $this->tokenService->signedCdnUrl($lesson, $user)]);
    }
}
