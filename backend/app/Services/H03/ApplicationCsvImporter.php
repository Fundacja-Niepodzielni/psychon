<?php

namespace App\Services\H03;

use App\Models\Application;
use App\Models\Edition;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

final class ApplicationCsvImporter
{
    /**
     * @return array{imported:int, skipped:array<int,array{line:int,reason:string}>}
     */
    public static function import(UploadedFile $file, Edition $edition): array
    {
        $handle = fopen($file->getRealPath(), 'rb');

        if ($handle === false) {
            throw new \RuntimeException('Nie można odczytać pliku CSV.');
        }

        try {
            $header = fgetcsv($handle);
            if ($header === false) {
                return ['imported' => 0, 'skipped' => [['line' => 1, 'reason' => 'empty_file']]];
            }

            $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header[0]);
            $delimiter = count($header) > 1 ? ',' : null;
            if ($delimiter === null) {
                rewind($handle);
                $firstLine = (string) fgets($handle);
                $delimiter = substr_count($firstLine, ';') > substr_count($firstLine, ',') ? ';' : ',';
                rewind($handle);
                $header = fgetcsv($handle, 0, $delimiter);
                $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header[0]);
            }

            $headers = array_map(static fn ($value): string => mb_strtolower(trim((string) $value)), $header);
            $required = ['first_name', 'last_name', 'email'];
            $missing = array_values(array_diff($required, $headers));

            if ($missing !== []) {
                return ['imported' => 0, 'skipped' => [['line' => 1, 'reason' => 'missing_headers:'.implode(',', $missing)]]];
            }

            $existingApplications = Application::query()
                ->forEdition($edition)
                ->pluck('email')
                ->map(fn (string $email): string => ApplicationEmailNormalizer::normalize($email))
                ->flip();
            $existingUsers = User::query()
                ->pluck('email')
                ->map(fn (string $email): string => ApplicationEmailNormalizer::normalize($email))
                ->flip();
            $seen = [];
            $rows = [];
            $skipped = [];
            $line = 1;

            while (($values = fgetcsv($handle, 0, $delimiter)) !== false) {
                $line++;
                if ($values === [null] || count(array_filter($values, fn ($value): bool => trim((string) $value) !== '')) === 0) {
                    continue;
                }

                $row = [];
                foreach ($headers as $index => $name) {
                    $row[$name] = trim((string) ($values[$index] ?? ''));
                }

                $email = filter_var($row['email'] ?? '', FILTER_VALIDATE_EMAIL);
                if (trim((string) ($row['first_name'] ?? '')) === '') {
                    $skipped[] = ['line' => $line, 'reason' => 'missing_first_name'];

                    continue;
                }
                if (trim((string) ($row['last_name'] ?? '')) === '') {
                    $skipped[] = ['line' => $line, 'reason' => 'missing_last_name'];

                    continue;
                }
                if ($email === false) {
                    $skipped[] = ['line' => $line, 'reason' => 'invalid_email'];

                    continue;
                }

                $normalized = ApplicationEmailNormalizer::normalize((string) $email);
                if (isset($seen[$normalized]) || $existingApplications->has($normalized)) {
                    $skipped[] = ['line' => $line, 'reason' => 'duplicate_email'];

                    continue;
                }
                if ($existingUsers->has($normalized)) {
                    $skipped[] = ['line' => $line, 'reason' => 'email_already_registered'];

                    continue;
                }

                $role = ($row['role'] ?? '') !== '' ? $row['role'] : 'volunteer';
                if (! in_array($role, ['super_admin', 'project_manager', 'instructor', 'volunteer', 'student'], true)) {
                    $skipped[] = ['line' => $line, 'reason' => 'invalid_role'];

                    continue;
                }

                $graduationYear = $row['graduation_year'] ?? '';
                if ($graduationYear !== '' && (! ctype_digit($graduationYear) || (int) $graduationYear < 1900 || (int) $graduationYear > now()->year + 1)) {
                    $skipped[] = ['line' => $line, 'reason' => 'invalid_graduation_year'];

                    continue;
                }

                $seen[$normalized] = true;
                $rows[] = [
                    'edition_id' => $edition->id,
                    'first_name' => $row['first_name'],
                    'last_name' => $row['last_name'],
                    'email' => $normalized,
                    'phone' => $row['phone'] ?? null,
                    'source' => $row['source'] ?? 'csv',
                    'role' => $role,
                    'payload' => null,
                    'university' => $row['university'] ?? null,
                    'graduation_year' => $graduationYear !== '' ? (int) $graduationYear : null,
                    'status' => 'new',
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            DB::transaction(function () use ($rows): void {
                foreach ($rows as $row) {
                    Application::query()->create($row);
                }
            });

            return ['imported' => count($rows), 'skipped' => $skipped];
        } finally {
            fclose($handle);
        }
    }
}
