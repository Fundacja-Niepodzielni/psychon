<?php

namespace App\Http\Controllers\Api\V1\H11;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H11\ReturnInternshipEntryRequest;
use App\Http\Resources\H11\AdminInternshipEntryResource;
use App\Models\InternshipEntry;
use App\Support\AuditLog;
use App\Support\Notify;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminInternshipController extends Controller
{
    public function pending(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->integer('per_page', 25), 1), 100);

        $paginator = InternshipEntry::query()
            ->with('user')
            ->where('status', 'submitted')
            ->orderBy('created_at')
            ->orderBy('id')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (InternshipEntry $entry): array => AdminInternshipEntryResource::make($entry)->resolve($request))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function accept(Request $request, int $id): JsonResponse
    {
        $entry = DB::transaction(function () use ($request, $id): InternshipEntry {
            $entry = InternshipEntry::query()
                ->with('user')
                ->whereKey($id)
                ->lockForUpdate()
                ->first();

            $this->assertSubmitted($entry);

            $entry->forceFill([
                'status' => 'accepted',
                'decided_by' => $request->user()->id,
                'decided_at' => now(),
            ])->save();

            AuditLog::record($request->user(), 'internship.accepted', $entry, [
                'entry_id' => $entry->id,
            ]);
            Notify::send(
                $entry->user,
                'internship.accepted',
                'Wpis stażu zaakceptowany',
                'Twój wpis stażu został zaakceptowany.',
                '/panel/staz',
            );

            return $entry->fresh('user');
        });

        return response()->json([
            'data' => AdminInternshipEntryResource::make($entry)->resolve($request),
        ]);
    }

    public function return(ReturnInternshipEntryRequest $request, int $id): JsonResponse
    {
        $entry = DB::transaction(function () use ($request, $id): InternshipEntry {
            $entry = InternshipEntry::query()
                ->with('user')
                ->whereKey($id)
                ->lockForUpdate()
                ->first();

            $this->assertSubmitted($entry);

            $entry->forceFill([
                'status' => 'returned',
                'review_comment' => $request->validated('comment'),
                'decided_by' => $request->user()->id,
                'decided_at' => now(),
            ])->save();

            AuditLog::record($request->user(), 'internship.returned', $entry, [
                'entry_id' => $entry->id,
            ]);
            Notify::send(
                $entry->user,
                'internship.returned',
                'Wpis stażu wymaga poprawy',
                'Twój wpis stażu został odesłany do poprawy.',
                '/panel/staz',
            );

            return $entry->fresh('user');
        });

        return response()->json([
            'data' => AdminInternshipEntryResource::make($entry)->resolve($request),
        ]);
    }

    private function assertSubmitted(?InternshipEntry $entry): void
    {
        if ($entry === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono wpisu.');
        }

        if ($entry->status !== 'submitted') {
            throw new ApiException(403, 'entry_locked', 'Ten wpis został już rozstrzygnięty.');
        }
    }
}
