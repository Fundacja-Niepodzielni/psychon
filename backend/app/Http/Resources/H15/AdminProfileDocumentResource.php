<?php

namespace App\Http\Resources\H15;

use App\Models\ProfileDocument;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\URL;

/**
 * @mixin ProfileDocument
 */
class AdminProfileDocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'uploaded_at' => $this->uploaded_at?->toIso8601ZuluString(),
            'download_url' => URL::temporarySignedRoute(
                'admin.profiles.documents.download',
                now()->addMinutes(15),
                ['profileId' => $this->profile_id, 'docId' => $this->id],
            ),
        ];
    }
}
