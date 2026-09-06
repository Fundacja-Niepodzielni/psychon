<?php

namespace App\Http\Resources\H03;

use App\Models\Application;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Application */
class ApplicationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'edition_id' => $this->edition_id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'source' => $this->source,
            'role' => $this->role,
            'payload' => $this->payload,
            'university' => $this->university,
            'graduation_year' => $this->graduation_year,
            'status' => $this->status,
            'rejection_reason' => $this->rejection_reason,
            'decided_by' => $this->decided_by,
            'decided_at' => $this->decided_at?->toIso8601ZuluString(),
            'user_id' => $this->user_id,
            'has_diploma_scan' => filled($this->diploma_scan_path),
            'diploma_scan_url' => filled($this->diploma_scan_path)
                ? url('/api/v1/admin/applications/'.$this->id.'/diploma-scan')
                : null,
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
        ];
    }
}
