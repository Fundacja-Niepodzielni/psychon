<?php

namespace App\Http\Controllers\Api\V1\H08;

use App\Http\Controllers\Api\V1\Admin\BunnyVideoAdminController;
use App\Models\Lesson;
use App\Services\H08\TopicScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Nagrania lekcji w kursie przypisanego prowadzącego — trasy `role:instructor`
 * w `routes/api/video.php`: zlecenie wgrania i odczyt stanu nagrania.
 *
 * Wgranie i odczyt stanu to dokładnie ten sam kod co trasy administracji
 * (`BunnyVideoAdminController::createUpload` i `::status`, dziedziczone):
 * te same odmowy treści, ten sam zapis nagrania „w drodze”, to samo
 * wznowienie i ten sam odczyt stanu. Różnica to wyłącznie wybór lekcji.
 *
 * Lekcję wybiera `TopicScope::instructor()` — aktywne przypisanie prowadzącego
 * na poziomie kursu, ta sama reguła co trasy tematów. Lekcja kursu obcego,
 * lekcja usunięta i lekcja nieistniejąca dają identyczne 404, zanim
 * cokolwiek innego zostanie sprawdzone: ciało żądania, konfiguracja dostawcy
 * nagrań, żądanie do dostawcy. Parametr trasy nie jest wiązany z modelem,
 * więc rolę spoza `instructor` pośrednik odrzuca 403 tak samo dla lekcji
 * istniejącej i nieistniejącej.
 */
final class InstructorVideoController extends BunnyVideoAdminController
{
    public function createInstructorUpload(Request $request, string $lesson): JsonResponse
    {
        return $this->createUpload($request, $this->scopedLesson($request, $lesson));
    }

    public function instructorStatus(Request $request, string $lesson): JsonResponse
    {
        return $this->status($this->scopedLesson($request, $lesson));
    }

    private function scopedLesson(Request $request, string $lesson): Lesson
    {
        return TopicScope::instructor($request->user())->lesson($lesson);
    }
}
