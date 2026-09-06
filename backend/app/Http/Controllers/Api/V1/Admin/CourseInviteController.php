<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\H08\InviteToCourseRequest;
use App\Models\Course;
use App\Services\H08\CourseInviter;
use Illuminate\Http\JsonResponse;

/**
 * Pakiet H08 · zaproszenie na kurs poza główną ścieżką. Trasa za
 * `role:project_manager,super_admin` (routes/api/h08.php).
 *
 * Kontroler jest cienki: reguła domenowa, powiadomienia i audyt żyją
 * w `CourseInviter`.
 */
class CourseInviteController extends Controller
{
    public function invite(InviteToCourseRequest $request, Course $course): JsonResponse
    {
        $invited = CourseInviter::invite($course, $request->userIds(), $request->user());

        return response()->json([
            'data' => ['invited' => $invited],
        ]);
    }
}
