<?php

namespace App\Http\Requests\H08;

use App\Models\CourseTopic;
use App\Services\H08\TopicScope;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Trasy pojedynczego tematu (`…/topics/{topic}`). `authorize()` odnajduje
 * temat w zasięgu wywołującego (`TopicScope`) PRZED walidacją ciała — temat
 * kursu spoza zasięgu i temat nieistniejący dają ten sam wyjątek 404.
 *
 * Sama klasa (bez reguł) obsługuje `DELETE …/topics/{topic}`.
 */
class TopicRequest extends FormRequest
{
    private ?CourseTopic $scopedTopic = null;

    public function authorize(): bool
    {
        $this->scopedTopic = $this->topicScope()->topic($this->route('topic'));

        return true;
    }

    public function rules(): array
    {
        return [];
    }

    public function scopedTopic(): CourseTopic
    {
        return $this->scopedTopic ??= $this->topicScope()->topic($this->route('topic'));
    }

    protected function topicScope(): TopicScope
    {
        return TopicScope::admin();
    }
}
