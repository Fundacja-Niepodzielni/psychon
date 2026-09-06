<?php

namespace App\Http\Controllers\Api\V1\H11;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H11\StoreInternshipEntryRequest;
use App\Http\Requests\H11\UpdateInternshipEntryRequest;
use App\Http\Resources\H11\InternshipEntryResource;
use App\Models\InternshipEntry;
use App\Support\ProgressAggregator;
use App\Support\Settings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InternshipEntryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $perPage = min(max((int) $request->integer('per_page', 25), 1), 100);

        $paginator = $user->internshipEntries()
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->paginate($perPage);

        $progress = ProgressAggregator::for($user);

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (InternshipEntry $entry): array => InternshipEntryResource::make($entry)->resolve($request))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
                'extra' => [
                    'accepted_hours' => (string) $progress['hours_accepted'],
                    'required_hours' => ProgressAggregator::formatDecimal((float) Settings::edition('internship_hours_required')),
                ],
            ],
        ]);
    }

    public function store(StoreInternshipEntryRequest $request): JsonResponse
    {
        $entry = InternshipEntry::create([
            ...$request->validated(),
            'user_id' => $request->user()->id,
            'status' => 'submitted',
        ]);

        return response()->json([
            'data' => InternshipEntryResource::make($entry)->resolve($request),
        ], 201);
    }

    public function update(UpdateInternshipEntryRequest $request, int $id): JsonResponse
    {
        $entry = DB::transaction(function () use ($request, $id): InternshipEntry {
            $entry = InternshipEntry::query()
                ->where('user_id', $request->user()->id)
                ->whereKey($id)
                ->lockForUpdate()
                ->first();

            if ($entry === null) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono wpisu.');
            }

            if ($entry->status === 'accepted') {
                throw new ApiException(403, 'entry_locked', 'Zaakceptowany wpis jest zablokowany.');
            }

            $entry->fill($request->validated());

            if ($entry->getOriginal('status') === 'returned') {
                $entry->status = 'submitted';
            }

            $entry->save();

            return $entry;
        });

        return response()->json([
            'data' => InternshipEntryResource::make($entry)->resolve($request),
        ]);
    }
}
