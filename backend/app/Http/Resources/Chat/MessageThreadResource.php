<?php

namespace App\Http\Resources\Chat;

use App\Models\MessageThread;
use App\Services\Chat\ChatThreadQuery;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin MessageThread
 */
class MessageThreadResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'supervisor' => $this->supervisor === null ? null : [
                'id' => $this->supervisor->id,
                'first_name' => $this->supervisor->first_name,
                'last_name' => $this->supervisor->last_name,
            ],
            'volunteer' => $this->volunteer === null ? null : [
                'id' => $this->volunteer->id,
                'first_name' => $this->volunteer->first_name,
                'last_name' => $this->volunteer->last_name,
            ],
            // `true` — rozmowa tylko do odczytu (wątek indywidualny po zmianie
            // prowadzącego); pisanie w niej kończy się 403 `thread_closed`.
            'read_only' => ! ChatThreadQuery::isOpen($this->resource),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
        ];
    }
}
