<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;

/**
 * GET /api/v1/me — minimal starter shape; the full profile is package H01.
 */
class MeController extends Controller
{
    public function __invoke(Request $request): UserResource
    {
        return UserResource::make($request->user());
    }
}
