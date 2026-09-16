<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Lesson;
use App\Services\Video\VideoTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;

/**
 * Panel administracji — wgrywanie nagrań do Bunny Stream i odczyt stanu
 * przetwarzania.
 *
 * `createUpload` NIE przyjmuje bajtów pliku — wydaje tylko podpisane
 * pozwolenie TUS, którym przeglądarka wgrywa wideo PROSTO do Bunny
 * (https://bunny.net/docs/stream/tus-resumable-uploads). Serwer nigdy nie
 * widzi treści pliku, więc trasa przyjmuje wyłącznie mały JSON ze znanymi
 * polami: wielobajtowe ciało (multipart z plikiem, surowe bajty pliku,
 * plik zakodowany w base64 w polu JSON) dostaje odmowę zamiast po cichu
 * zaakceptować sukces bez wgrania czegokolwiek —
 * `assertNotMultipartUpload()` łapie multipart z załącznikiem,
 * `assertBodyWithinLimit()` odcina każde inne ciało powyżej rozsądnego
 * limitu treści JSON, a walidacja niżej odrzuca zarówno nieznane pole, jak
 * i pole, które nie jest krótkim tekstem.
 *
 * Trasa `createUpload` stoi za `role:super_admin` (jedyna rola z
 * pozwoleniem na wgranie). `status` stoi za tym samym progiem co reszta
 * CMS kursów (`role:project_manager,super_admin`), bo to odczyt, nie
 * zmiana.
 */
class BunnyVideoAdminController extends Controller
{
    /**
     * Limit treści żądania JSON o wgranie — kilka razy więcej niż
     * jakikolwiek realny tytuł nagrania wymaga, a wciąż o rzędy wielkości
     * mniej niż jedna sekunda skompresowanego wideo, więc plik owinięty w
     * base64 i wciśnięty w pole JSON nie mieści się w limicie.
     */
    private const MAX_UPLOAD_REQUEST_BYTES = 8192;

    public function __construct(private readonly VideoTokenService $tokenService) {}

    public function createUpload(Request $request, Lesson $lesson): JsonResponse
    {
        if (! $this->tokenService->isConfigured()) {
            throw new ApiException(
                503,
                'video_not_configured',
                'Wgrywanie nagrań jest chwilowo niedostępne — brak konfiguracji dostawcy wideo.',
            );
        }

        $this->assertNotMultipartUpload($request);
        $this->assertBodyWithinLimit($request);

        if (! $request->isJson()) {
            throw new ApiException(422, 'invalid_payload', 'Oczekiwano danych JSON.');
        }

        $payload = (array) $request->json()->all();
        $unknownFields = array_diff(array_keys($payload), ['title']);

        if ($unknownFields !== []) {
            throw new ApiException(422, 'invalid_payload', 'Żądanie zawiera nieznane pole.');
        }

        $validated = Validator::make($payload, [
            'title' => ['required', 'string', 'max:255'],
        ])->validate();

        $libraryId = (string) config('services.bunny.library_id');
        $apiKey = (string) config('services.bunny.api_key');

        $response = Http::withHeaders([
            'AccessKey' => $apiKey,
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
        ])->post("https://video.bunnycdn.com/library/{$libraryId}/videos", [
            'title' => $validated['title'],
        ]);

        if (! $response->successful()) {
            throw new ApiException(502, 'bunny_error', 'Nie udało się utworzyć wideo w Bunny Stream.');
        }

        $videoId = $response->json('guid');

        if (! is_string($videoId) || $videoId === '') {
            throw new ApiException(502, 'bunny_error', 'Bunny Stream nie zwrócił identyfikatora wideo.');
        }

        $lesson->video_provider_id = $videoId;
        $lesson->save();

        $expiresAt = now()->addHours(6)->getTimestamp();
        // Wzór TUS: SHA256(library_id + api_key + expiration_time + video_id)
        // https://bunny.net/docs/stream/tus-resumable-uploads — klucz API NIE
        // wraca w odpowiedzi.
        $signature = hash('sha256', $libraryId.$apiKey.$expiresAt.$videoId);

        return response()->json([
            'data' => [
                'video_id' => $videoId,
                'upload_url' => 'https://video.bunnycdn.com/tusupload',
                'library_id' => $libraryId,
                'expiration_time' => $expiresAt,
                'signature' => $signature,
            ],
        ], 201);
    }

    public function status(Lesson $lesson): JsonResponse
    {
        if (! $this->tokenService->isConfigured()) {
            throw new ApiException(
                503,
                'video_not_configured',
                'Stan przetwarzania jest chwilowo niedostępny — brak konfiguracji dostawcy wideo.',
            );
        }

        if ($lesson->video_provider_id === null) {
            return response()->json(['data' => ['status' => 'no_video']]);
        }

        $libraryId = (string) config('services.bunny.library_id');
        $apiKey = (string) config('services.bunny.api_key');
        $videoId = $lesson->video_provider_id;

        $response = Http::withHeaders(['AccessKey' => $apiKey])
            ->get("https://video.bunnycdn.com/library/{$libraryId}/videos/{$videoId}");

        if (! $response->successful()) {
            throw new ApiException(502, 'bunny_error', 'Nie udało się pobrać stanu przetwarzania wideo z Bunny.');
        }

        return response()->json([
            'data' => [
                'status' => $this->mapStatus((int) $response->json('status', -1)),
                'duration_seconds' => (int) ($response->json('length') ?? 0),
                'preview_embed_url' => $this->tokenService->signedEmbedUrl($lesson)['url'],
            ],
        ]);
    }

    /**
     * Multipart z załącznikiem dostaje odmowę zamiast po cichu ignorować
     * pole pliku — klient ma wgrać wideo bezpośrednio do Bunny, nie na tę
     * trasę.
     */
    private function assertNotMultipartUpload(Request $request): void
    {
        if ($request->allFiles() !== []) {
            throw new ApiException(
                422,
                'no_direct_upload',
                'Ten serwer nie przyjmuje pliku wideo — wgraj go bezpośrednio do Bunny Stream podpisanym pozwoleniem.',
            );
        }
    }

    /**
     * Odcina każde ciało większe niż `MAX_UPLOAD_REQUEST_BYTES` PRZED próbą
     * odczytania go jako JSON — obejmuje więc też surowe bajty pliku
     * wysłane z tytułem w zapytaniu (Content-Type inny niż JSON) i plik w
     * base64 wciśnięty w pole JSON, nie tylko multipart.
     */
    private function assertBodyWithinLimit(Request $request): void
    {
        $contentLength = $request->header('Content-Length');
        $size = is_numeric($contentLength) ? (int) $contentLength : strlen($request->getContent());

        if ($size > self::MAX_UPLOAD_REQUEST_BYTES) {
            throw new ApiException(413, 'payload_too_large', 'Żądanie jest za duże.');
        }
    }

    /**
     * Kody statusu wideo Bunny Stream (API Reference — Video object,
     * pole `status`): 0 Created, 1 Uploaded, 2 Processing, 3 Transcoding,
     * 4 Finished, 5 Error, 6 UploadFailed.
     */
    private function mapStatus(int $bunnyStatus): string
    {
        return match ($bunnyStatus) {
            4 => 'finished',
            5, 6 => 'error',
            default => 'processing',
        };
    }
}
