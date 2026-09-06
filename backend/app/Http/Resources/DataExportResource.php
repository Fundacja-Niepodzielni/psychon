<?php

namespace App\Http\Resources;

use App\Models\DataExport;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RODO export status (H01). Contract shape: {"id": "ex_…", "status": "queued"}.
 *
 * @mixin DataExport
 */
class DataExportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->public_id,
            'status' => $this->status,
            'requested_at' => $this->created_at?->toIso8601ZuluString(),
            'completed_at' => $this->completed_at?->toIso8601ZuluString(),
            'download_url' => $this->status === 'ready'
                ? url("/api/v1/me/exports/{$this->public_id}/download")
                : null,
        ];
    }
}
