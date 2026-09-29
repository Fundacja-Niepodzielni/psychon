<?php

namespace App\Http\Controllers\Concerns;

use App\Http\Resources\H08\CourseTopicResource;
use App\Models\CourseTopic;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Odpowiedzi tras tematów — wspólne dla panelu administracji i prowadzącego
 * (`CourseTopicAdminController`, `InstructorCourseTopicController`). Lista
 * nie jest stronicowana, tak samo jak lista lekcji kursu: ekran porządkuje
 * cały układ naraz.
 */
trait RespondsWithTopics
{
    /**
     * @param  Collection<int, CourseTopic>  $topics
     */
    private function topicsResponse(Request $request, Collection $topics): JsonResponse
    {
        return response()->json([
            'data' => $topics
                ->map(fn (CourseTopic $topic): array => CourseTopicResource::make($topic)->resolve($request))
                ->values()
                ->all(),
        ]);
    }

    private function topicResponse(Request $request, CourseTopic $topic, int $status = 200): JsonResponse
    {
        return response()->json([
            'data' => CourseTopicResource::make($topic->refresh())->resolve($request),
        ], $status);
    }

    private function deletedTopicResponse(CourseTopic $topic): JsonResponse
    {
        return response()->json([
            'data' => ['id' => $topic->id, 'deleted' => true],
        ]);
    }
}
