<?php

namespace App\Http\Resources\Chat;

use App\Models\MessageThread;
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
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
        ];
    }
}
