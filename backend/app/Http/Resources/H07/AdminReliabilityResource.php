<?php

namespace App\Http\Resources\H07;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminReliabilityResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource['id'],
            'first_name' => $this->resource['first_name'],
            'last_name' => $this->resource['last_name'],
            'email' => $this->resource['email'],
            'reliability_percent' => $this->formatPercent($this->resource['reliability_percent']),
            'below_threshold' => $this->resource['below_threshold'],
        ];
    }

    protected function formatPercent(?int $percent): ?string
    {
        return $percent === null ? null : (string) $percent;
    }
}
