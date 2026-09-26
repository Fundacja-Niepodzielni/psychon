<?php

namespace App\Http\Resources\H01;

use App\Models\CooperationRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Widok osoby zgłaszającej — bez danych osoby z administracji.
 *
 * @mixin CooperationRequest
 */
class CooperationRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'body' => $this->body,
            'status' => $this->status,
            'response' => $this->response,
            'responded_at' => $this->responded_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
        ];
    }
}
