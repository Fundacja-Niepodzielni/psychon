<?php

namespace App\Http\Resources\H07;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InstructorReliabilityResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource['id'],
            'first_name' => $this->resource['first_name'],
            'last_name' => $this->resource['last_name'],
            'reliability_percent' => $this->resource['reliability_percent'] === null
                ? null
                : (string) $this->resource['reliability_percent'],
            'below_threshold' => $this->resource['below_threshold'],
        ];
    }
}
