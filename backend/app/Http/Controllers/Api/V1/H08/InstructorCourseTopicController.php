<?php

namespace App\Http\Controllers\Api\V1\H08;

use App\Http\Controllers\Concerns\RespondsWithTopics;
use App\Http\Controllers\Controller;
use App\Http\Requests\H08\InstructorCourseTopicRequest;
use App\Http\Requests\H08\InstructorReorderTopicsRequest;
use App\Http\Requests\H08\InstructorStoreTopicRequest;
use App\Http\Requests\H08\InstructorTopicRequest;
use App\Http\Requests\H08\InstructorUpdateTopicRequest;
use App\Services\H08\TopicWriter;
use Illuminate\Http\JsonResponse;

/**
 * Tematy kursu przypisanego prowadzącego — trasy `role:instructor`
 * w `routes/api/h08.php`. Te same usługi i kształty co panel administracji
 * (`TopicWriter`, `CourseTopicResource`); różnica to zasięg żądań
 * (`ScopesTopicsToAssignedInstructor`): kurs bez aktywnego przypisania
 * prowadzącego i kurs nieistniejący dają identyczne 404, przed walidacją
 * ciała.
 */
class InstructorCourseTopicController extends Controller
{
    use RespondsWithTopics;

    public function index(InstructorCourseTopicRequest $request, int $course): JsonResponse
    {
        return $this->topicsResponse($request, TopicWriter::list($request->scopedCourse()));
    }

    public function store(InstructorStoreTopicRequest $request, int $course): JsonResponse
    {
        $topic = TopicWriter::create($request->scopedCourse(), (string) $request->validated('title'), $request->user());

        return $this->topicResponse($request, $topic, 201);
    }

    public function update(InstructorUpdateTopicRequest $request, int $topic): JsonResponse
    {
        $model = TopicWriter::update($request->scopedTopic(), (string) $request->validated('title'), $request->user());

        return $this->topicResponse($request, $model);
    }

    public function destroy(InstructorTopicRequest $request, int $topic): JsonResponse
    {
        $model = $request->scopedTopic();

        TopicWriter::delete($model, $request->user());

        return $this->deletedTopicResponse($model);
    }

    public function reorder(InstructorReorderTopicsRequest $request, int $course): JsonResponse
    {
        $topics = TopicWriter::reorder($request->scopedCourse(), $request->layout(), $request->user());

        return $this->topicsResponse($request, $topics);
    }
}
