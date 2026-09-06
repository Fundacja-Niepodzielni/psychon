<?php

namespace App\Http\Resources\H15;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminPsychologistProfileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user' => [
                'id' => $this->user->id,
                'first_name' => $this->user->first_name,
                'last_name' => $this->user->last_name,
            ],
            'specializations' => $this->specializations,
            'approach' => $this->approach,
            'city' => $this->city,
            'bio' => $this->bio,
            'publication_consent_granted' => $this->user->consents
                ->contains(fn ($consent): bool => $consent->type === 'publikacja_profilu'
                    && $consent->granted_at !== null
                    && $consent->withdrawn_at === null),
            'status' => $this->status,
            'return_reason' => $this->return_reason,
            'decided_at' => $this->decided_at?->toIso8601ZuluString(),
            'documents' => AdminProfileDocumentResource::collection($this->documents),
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
        ];
    }
}
