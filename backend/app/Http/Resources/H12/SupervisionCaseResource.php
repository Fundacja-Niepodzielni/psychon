<?php

namespace App\Http\Resources\H12;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SupervisionCaseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'subject' => $this->subject,
            'body' => $this->body,
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'reporter' => $this->whenLoaded('reporter', fn (): array => [
                'id' => $this->reporter->id,
                'first_name' => $this->reporter->first_name,
                'last_name' => $this->reporter->last_name,
            ]),
            'volunteer' => $this->whenLoaded('volunteer', fn (): ?array => $this->volunteer === null ? null : [
                'id' => $this->volunteer->id,
                'first_name' => $this->volunteer->first_name,
                'last_name' => $this->volunteer->last_name,
            ]),
        ];
    }
}
