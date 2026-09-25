<?php

namespace App\Http\Resources\H01;

use App\Models\CooperationRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin CooperationRequest
 */
class AdminCooperationRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            ...CooperationRequestResource::make($this->resource)->resolve($request),
            'responded_by' => $this->responded_by,
            'user' => $this->user === null ? null : [
                'id' => $this->user->id,
                'first_name' => $this->user->first_name,
                'last_name' => $this->user->last_name,
                'email' => $this->user->email,
            ],
        ];
    }
}
