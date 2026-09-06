<?php

namespace App\Jobs;

use App\Models\Consent;
use App\Models\DataExport;
use App\Models\Document;
use App\Models\InternshipEntry;
use App\Models\LessonProgress;
use App\Support\Notify;
use App\Support\ProgressAggregator;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Builds a participant's RODO data export (H01 · M2 pkt 4) in the background:
 * profile, consents, progress, internship entries, document metadata. Writes
 * one JSON file to the `local` disk, then fires `export.ready` (contract §3.1).
 */
class GenerateDataExport implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public int $exportId) {}

    public function handle(): void
    {
        $export = DataExport::with('user')->find($this->exportId);

        if ($export === null || $export->user === null) {
            return; // request (or account) went away before the worker picked it up
        }

        $export->update(['status' => 'processing']);

        try {
            $path = "exports/{$export->public_id}.json";

            Storage::disk('local')->put(
                $path,
                json_encode(
                    $this->payloadFor($export),
                    JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
                ),
            );

            $export->update([
                'status' => 'ready',
                'file_path' => $path,
                'completed_at' => now(),
                'error' => null,
            ]);

            Notify::send(
                $export->user,
                'export.ready',
                'Eksport danych osobowych jest gotowy',
                'Twój eksport danych (RODO) został przygotowany. Pobierz go w zakładce Profil.',
                '/panel/profil',
            );
        } catch (Throwable $e) {
            $export->update(['status' => 'failed', 'error' => $e->getMessage()]);

            throw $e;
        }
    }

    /**
     * The five data scopes required by the H01 acceptance criteria.
     *
     * @return array<string, mixed>
     */
    private function payloadFor(DataExport $export): array
    {
        $user = $export->user;

        return [
            'generated_at' => now()->toIso8601ZuluString(),
            'export_id' => $export->public_id,

            'profile' => [
                'id' => $user->id,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'phone' => $user->phone,
                'pesel' => $user->pesel,
                'address' => [
                    'street' => $user->address_street,
                    'city' => $user->address_city,
                    'zip' => $user->address_zip,
                ],
                'role' => $user->role,
                'product_group' => $user->product_group,
                'access_expires_at' => $user->access_expires_at?->toIso8601ZuluString(),
                'program_completed_at' => $user->program_completed_at?->toIso8601ZuluString(),
                'created_at' => $user->created_at?->toIso8601ZuluString(),
            ],

            'consents' => $user->consents
                ->map(fn (Consent $c): array => [
                    'type' => $c->type,
                    'document_version' => $c->document_version,
                    'granted_at' => $c->granted_at?->toIso8601ZuluString(),
                    'withdrawn_at' => $c->withdrawn_at?->toIso8601ZuluString(),
                ])
                ->values()
                ->all(),

            'progress' => [
                'summary' => ProgressAggregator::for($user),
                'lessons' => $user->lessonProgress()
                    ->get()
                    ->map(fn (LessonProgress $p): array => [
                        'lesson_id' => $p->lesson_id,
                        'watched_seconds' => $p->watched_seconds,
                        'active_seconds' => $p->active_seconds,
                        'open_count' => $p->open_count,
                        'is_completed' => $p->is_completed,
                        'completed_at' => $p->completed_at?->toIso8601ZuluString(),
                        'last_activity_at' => $p->last_activity_at?->toIso8601ZuluString(),
                    ])
                    ->all(),
            ],

            'internship_entries' => $user->internshipEntries()
                ->get()
                ->map(fn (InternshipEntry $e): array => [
                    'date' => $e->date?->toDateString(),
                    'hours' => $e->hours,
                    'form' => $e->form,
                    'consultations_count' => $e->consultations_count,
                    'description' => $e->description,
                    'status' => $e->status,
                    'review_comment' => $e->review_comment,
                    'decided_at' => $e->decided_at?->toIso8601ZuluString(),
                ])
                ->all(),

            // Metadata only — the generated PDFs themselves are not part of the export.
            'documents' => $user->documents()
                ->get()
                ->map(fn (Document $d): array => [
                    'id' => $d->id,
                    'type' => $d->type,
                    'number' => $d->number,
                    'generated_at' => $d->generated_at?->toIso8601ZuluString(),
                    'signature_status' => $d->signature_status,
                ])
                ->all(),
        ];
    }
}
