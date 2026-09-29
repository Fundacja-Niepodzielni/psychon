<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Concerns\RespondsWithTopics;
use App\Http\Controllers\Controller;
use App\Http\Requests\H08\CourseTopicRequest;
use App\Http\Requests\H08\ReorderTopicsRequest;
use App\Http\Requests\H08\StoreTopicRequest;
use App\Http\Requests\H08\TopicRequest;
use App\Http\Requests\H08\UpdateTopicRequest;
use App\Services\H08\TopicWriter;
use Illuminate\Http\JsonResponse;

/**
 * Pakiet H08 · tematy kursu w panelu administracji. Wszystkie trasy za
 * `role:project_manager,super_admin` (routes/api/h08.php).
 *
 * Parametry tras są liczbami, bez wiązania modelu: kurs i temat odnajduje
 * żądanie (`CourseTopicRequest`, `TopicRequest`) w `authorize()`, przed
 * walidacją ciała. Zapis, kolejność i audyt żyją w `TopicWriter`.
 *
 * `PATCH …/topics/reorder` to ten sam legalny wyjątek nazewniczy co
 * `PATCH …/lessons/reorder` (kontrakt §1).
 */
class CourseTopicAdminController extends Controller
{
    use RespondsWithTopics;

    public function index(CourseTopicRequest $request, int $course): JsonResponse
    {
        return $this->topicsResponse($request, TopicWriter::list($request->scopedCourse()));
    }

    public function store(StoreTopicRequest $request, int $course): JsonResponse
    {
        $topic = TopicWriter::create($request->scopedCourse(), (string) $request->validated('title'), $request->user());

        return $this->topicResponse($request, $topic, 201);
    }

    public function update(UpdateTopicRequest $request, int $topic): JsonResponse
    {
        $model = TopicWriter::update($request->scopedTopic(), (string) $request->validated('title'), $request->user());

        return $this->topicResponse($request, $model);
    }

    public function destroy(TopicRequest $request, int $topic): JsonResponse
    {
        $model = $request->scopedTopic();

        TopicWriter::delete($model, $request->user());

        return $this->deletedTopicResponse($model);
    }

    public function reorder(ReorderTopicsRequest $request, int $course): JsonResponse
    {
        $topics = TopicWriter::reorder($request->scopedCourse(), $request->layout(), $request->user());

        return $this->topicsResponse($request, $topics);
    }
}
