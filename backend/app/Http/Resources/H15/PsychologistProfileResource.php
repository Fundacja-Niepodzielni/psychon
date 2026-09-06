<?php

namespace App\Http\Resources\H15;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PsychologistProfileResource extends JsonResource
{
    public function __construct($resource, private readonly User $user)
    {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        return [
            'eligible' => $this->user->program_completed_at !== null,
            'specializations' => $this->specializations,
            'approach' => $this->approach,
            'city' => $this->city,
            'bio' => $this->bio,
            'publication_consent_granted' => $this->user->consents()
                ->where('type', 'publikacja_profilu')
                ->whereNotNull('granted_at')
                ->whereNull('withdrawn_at')
                ->exists(),
            'status' => $this->status ?? 'draft',
            'return_reason' => $this->return_reason,
            'documents' => ProfileDocumentResource::collection($this->exists ? $this->documents : collect()),
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
        ];
    }
}
