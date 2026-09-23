<?php

namespace App\Http\Controllers\Api\V1\H22;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H22\AcceptLegalDocumentRequest;
use App\Http\Resources\H22\PublicLegalDocumentResource;
use App\Models\Application;
use App\Models\Consent;
use App\Models\LegalDocumentVersion;
use App\Support\AuditLog;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Pakiet H22 · Dokumenty prawne — odczyty publiczne i akceptacja.
 */
class LegalDocumentController extends Controller
{
    public function current(Request $request, string $type): JsonResponse
    {
        $this->assertKnownType($type);

        $current = LegalDocumentVersion::current($type);

        if ($current === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zasobu.');
        }

        return response()->json([
            'data' => PublicLegalDocumentResource::make($current)->resolve($request),
        ]);
    }

    public function show(Request $request, string $type, string $version): JsonResponse
    {
        $this->assertKnownType($type);

        $document = LegalDocumentVersion::query()
            ->ofType($type)
            ->where('version', $version)
            ->published()
            ->first();

        if ($document === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zasobu.');
        }

        return response()->json([
            'data' => PublicLegalDocumentResource::make($document)->resolve($request),
        ]);
    }

    /**
     * Akceptacja WYŁĄCZNIE bieżącej wersji: `version` w żądaniu musi
     * zgadzać się z wersją aktualnie opublikowaną. Ponowna akceptacja tej
     * samej (nadal bieżącej) wersji nie tworzy duplikatu — zwraca istniejący
     * wpis.
     *
     * Dwa równoległe żądania: obie transakcje mogą przejść sprawdzenie
     * `existing` (brak wiersza), zanim którakolwiek zdąży wstawić swój —
     * indeks `consents_user_type_version_unique` rozstrzyga, która wygrywa.
     * Przegrana dostaje `QueryException` (naruszenie unikalności); łapiemy
     * je tu i zwracamy wiersz zwycięzcy zamiast błędu — bez drugiego wpisu
     * `audit_log` (transakcja przegranej cofa się w całości, więc jej
     * `AuditLog::record`, wywoływany po `Consent::create()`, nigdy nie biegnie).
     *
     * Bramka rodzaju: przeciwko `Application::CONSENT_COLUMNS`, NIE przeciwko
     * `LegalDocumentVersion::TYPES` — decyzja właściciela z 23.09.2026
     * (wariant A). Na tej trasie „znany rodzaj" znaczy rodzaj zgody;
     * rodzaj informacyjny (`LegalDocumentVersion::INFORMATIONAL_TYPES`, np.
     * `klauzula-rodo`) dostaje ten sam błąd `422 unknown_document_type` co
     * rodzaj całkiem nieznany — nikt jej nie udziela, więc nie ma czego tu
     * przyjmować. Trasy odczytu (`current`, `show`) i administracyjne dalej
     * bramkują po `TYPES` — klauzula ma zostać publicznie czytelna i dalej
     * dać się wydać w nowej wersji.
     */
    public function accept(AcceptLegalDocumentRequest $request, string $type): JsonResponse
    {
        if (! array_key_exists($type, Application::CONSENT_COLUMNS)) {
            throw new ApiException(422, 'unknown_document_type', 'Nieznany rodzaj dokumentu.', errors: [
                'type' => ['Nieznany rodzaj dokumentu.'],
            ]);
        }

        $user = $request->user();
        $current = LegalDocumentVersion::current($type);
        $requestedVersion = $request->string('version')->value();

        if ($current === null || $current->version !== $requestedVersion) {
            throw new ApiException(
                422,
                'document_version_not_current',
                'Ta wersja nie jest już bieżąca. Odśwież dokument i zaakceptuj aktualną wersję.',
                errors: ['version' => ['Ta wersja nie jest już bieżąca.']],
                reason: ['current_version' => $current?->version],
            );
        }

        $findExisting = fn (): ?Consent => Consent::query()
            ->where('user_id', $user->id)
            ->where('type', $type)
            ->where('document_version', $current->version)
            ->whereNull('withdrawn_at')
            ->first();

        try {
            $consent = DB::transaction(function () use ($user, $type, $current, $findExisting): Consent {
                $existing = $findExisting();

                if ($existing !== null) {
                    return $existing;
                }

                $consent = Consent::create([
                    'user_id' => $user->id,
                    'type' => $type,
                    'document_version' => $current->version,
                    'granted_at' => now(),
                ]);

                AuditLog::record($user, 'legal_document.accepted', $current, [
                    'type' => $type,
                    'version' => $current->version,
                ]);

                return $consent;
            });
        } catch (QueryException $e) {
            if (! self::isUniqueConstraintViolation($e)) {
                throw $e;
            }

            $consent = $findExisting();

            if ($consent === null) {
                throw $e;
            }
        }

        return response()->json([
            'data' => [
                'type' => $consent->type,
                'document_version' => $consent->document_version,
            ],
        ], $consent->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * Naruszenie unikalności niezależnie od silnika: `23505` (PostgreSQL —
     * produkcja i testy), `1062` (MySQL/MariaDB), komunikat SQLite (lokalne
     * narzędzia). Każdy inny `QueryException` leci dalej niezmieniony.
     */
    private static function isUniqueConstraintViolation(QueryException $e): bool
    {
        $sqlState = $e->errorInfo[0] ?? $e->getCode();

        return $sqlState === '23505'
            || (int) $sqlState === 1062
            || str_contains($e->getMessage(), 'UNIQUE constraint failed');
    }

    private function assertKnownType(string $type): void
    {
        if (! in_array($type, LegalDocumentVersion::TYPES, true)) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono zasobu.');
        }
    }
}
