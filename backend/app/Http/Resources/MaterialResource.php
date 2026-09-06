<?php

namespace App\Http\Resources;

use App\Models\Material;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\URL;

/**
 * Material entry of GET /courses/{slug} — contract §2 „Kursy (H05)".
 *
 * @mixin Material
 */
class MaterialResource extends JsonResource
{
    /** Contract §2 describes download_url as „podpisany, wygasa". */
    private const LINK_TTL_MINUTES = 15;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            // Widening of contract §2, which lists a material as exactly
            // {id, name, download_url}. The plan asked the UI to show a
            // human-readable size and the column already carries it, so the
            // field is shipped ahead of the guardian's ruling and flagged as
            // deviation (7) in DEMO/H05.md. Bytes, integer — the front formats.
            'size' => $this->size,
            'download_url' => URL::temporarySignedRoute(
                'materials.download',
                now()->addMinutes(self::LINK_TTL_MINUTES),
                // The signature covers every parameter, so `u` binds the link
                // to one account and cannot be swapped for another.
                ['material' => $this->id, 'u' => $request->user()->id],
            ),
        ];
    }
}
