<?php

namespace App\Http\Resources\H15;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProfileDocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'uploaded_at' => $this->uploaded_at?->toIso8601ZuluString(),
        ];
    }
}
