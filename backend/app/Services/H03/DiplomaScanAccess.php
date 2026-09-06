<?php

namespace App\Services\H03;

use App\Exceptions\ApiException;
use App\Models\Application;
use App\Models\SensitiveAccessLogEntry;
use App\Models\User;
use App\Support\AuditLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

final class DiplomaScanAccess
{
    /**
     * @return array{path:string, filename:string, mime:string}
     */
    public static function open(Application $application, User $viewer): array
    {
        $relativePath = $application->diploma_scan_path;
        if (! is_string($relativePath) || $relativePath === '') {
            throw new ApiException(404, 'diploma_scan_not_found', 'Zgłoszenie nie zawiera skanu dyplomu.');
        }

        $disk = Storage::disk('local');
        if (! $disk->exists($relativePath)) {
            throw new ApiException(404, 'diploma_scan_not_found', 'Nie znaleziono pliku skanu dyplomu.');
        }

        // Resolve the disk at runtime so Storage::fake('local') and other
        // adapters use the same root that produced the candidate path.
        $root = realpath($disk->path(''));
        $path = realpath($disk->path($relativePath));
        if ($root === false || $path === false || ! str_starts_with($path, $root.DIRECTORY_SEPARATOR)) {
            throw new ApiException(404, 'diploma_scan_not_found', 'Nie znaleziono pliku skanu dyplomu.');
        }

        $mime = mime_content_type($path) ?: 'application/octet-stream';
        $filename = 'diploma-scan-'.$application->id.'.'.pathinfo($path, PATHINFO_EXTENSION);

        DB::transaction(function () use ($application, $viewer): void {
            SensitiveAccessLogEntry::query()->create([
                'viewer_id' => $viewer->id,
                'file_type' => 'diploma_scan',
                'file_id' => $application->id,
                'viewed_at' => now(),
            ]);
            AuditLog::record($viewer, 'sensitive.viewed', $application, [
                'file_type' => 'diploma_scan',
                'file_id' => $application->id,
            ]);
        });

        return ['path' => $path, 'filename' => $filename, 'mime' => $mime];
    }
}
