<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Lesson;
use App\Services\H08\RecordingIdIndex;
use App\Services\Video\LessonRecording;
use App\Services\Video\RecordingStateRefresher;
use App\Services\Video\RecordingStatus;
use App\Services\Video\VideoProviderId;
use App\Services\Video\VideoTokenService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;

/**
 * Panel administracji — wgrywanie nagrań do Bunny Stream i odczyt stanu
 * przetwarzania.
 *
 * Lekcja ma nagranie ODTWARZANE (`video_provider_id`) i nagranie „W DRODZE”
 * (`video_pending_id`). `createUpload` zapisuje nowe nagranie wyłącznie jako
 * „w drodze”: uczestnik dostaje link do dotychczasowego nagrania aż do chwili,
 * w której odczyt stanu (`status`) pierwszy raz zobaczy nowe nagranie gotowe
 * i w tej samej transakcji zrobi z niego nagranie odtwarzane. Wgranie
 * przerwane albo zakończone błędem zostawia dotychczasowe nagranie.
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

    /** Zdanie odmowy, gdy dostawca zwróci identyfikator trzymany przez inną lekcję. */
    private const string TAKEN_MESSAGE = 'Bunny Stream zwrócił identyfikator nagrania, który jest już przypisany do innej lekcji.';

    private const string PENDING_INDEX = 'lessons_video_pending_id_unique';

    public function __construct(
        private readonly VideoTokenService $tokenService,
        private readonly RecordingStateRefresher $refresher,
    ) {}

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

        // Wznowienie: lekcja ma nagranie „w drodze”, którego plik jeszcze nie
        // dotarł, założone mniej niż sześć godzin temu. Nowe uprawnienie dotyczy
        // TEGO SAMEGO nagrania — u dostawcy nic nie jest zakładane, w lekcji nic
        // się nie zmienia (czas stanu zostaje chwilą założenia nagrania).
        $recording = LessonRecording::of($lesson);

        if ($recording->resumable(now())) {
            return $this->uploadPermission((string) $recording->pendingId, $libraryId, $apiKey, resumed: true);
        }

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

        if (! VideoProviderId::isValid($videoId)) {
            throw new ApiException(502, 'bunny_error', 'Bunny Stream nie zwrócił identyfikatora wideo.');
        }

        $this->storePending($lesson, (string) VideoProviderId::normalize($videoId));

        return $this->uploadPermission($videoId, $libraryId, $apiKey, resumed: false);
    }

    /**
     * Nowe nagranie trafia do lekcji jako „w drodze”, w stanie „wysyłanie”.
     * Identyfikator odtwarzany zostaje bez zmian — z jednym wyjątkiem: jeśli
     * lekcja nie ma nagrania „w drodze”, a jej dotychczasowe nagranie nie
     * nadaje się do odtworzenia (stan „błąd”, „przetwarzanie” albo „wysyłanie”
     * ustalony wcześniej, albo identyfikator spoza wzorca), jego identyfikator
     * jest zdejmowany. Dzięki temu lekcja z dwoma nagraniami zawsze ma
     * odtwarzane gotowe.
     *
     * Identyfikator, który trzyma już inna żywa lekcja — jako odtwarzany albo
     * „w drodze” — dałby dwóm lekcjom jedno nagranie: odpowiedź jest błędem
     * usługi wideo, a lekcja zostaje bez zmian.
     */
    private function storePending(Lesson $lesson, string $pendingId): void
    {
        try {
            DB::transaction(function () use ($lesson, $pendingId): void {
                $fresh = Lesson::query()->whereKey($lesson->getKey())->lockForUpdate()->firstOrFail();

                $takenElsewhere = Lesson::query()
                    ->whereKeyNot($fresh->getKey())
                    ->where(function ($query) use ($pendingId): void {
                        $query->whereRaw('lower(video_provider_id) = ?', [$pendingId])
                            ->orWhereRaw('lower(video_pending_id) = ?', [$pendingId]);
                    })
                    ->exists();

                if ($takenElsewhere) {
                    throw new ApiException(502, 'bunny_error', self::TAKEN_MESSAGE);
                }

                $recording = LessonRecording::of($fresh);

                if ($fresh->video_provider_id !== null && ! $recording->hasPending() && ! $recording->hasPlayable()) {
                    $fresh->video_provider_id = null;
                }

                $fresh->video_pending_id = $pendingId;
                $fresh->video_status = RecordingStatus::UPLOADING;
                $fresh->video_status_at = now();
                $fresh->save();
            });
        } catch (UniqueConstraintViolationException $e) {
            if (! $this->isRecordingIndexViolation($e)) {
                throw $e;
            }

            throw new ApiException(502, 'bunny_error', self::TAKEN_MESSAGE);
        }

        $lesson->refresh();
    }

    /**
     * Naruszenie jednego z dwóch indeksów niepowtarzalności nagrania: nagrania
     * odtwarzanego (`lessons_video_provider_id_unique`) albo nagrania „w drodze”
     * (`lessons_video_pending_id_unique`). Rozpoznanie po NAZWIE indeksu —
     * naruszenie innego indeksu lekcji zostaje błędem, jakim było.
     */
    private function isRecordingIndexViolation(UniqueConstraintViolationException $e): bool
    {
        return RecordingIdIndex::isViolatedBy($e)
            || str_contains($e->getMessage(), '"'.self::PENDING_INDEX.'"');
    }

    /**
     * Uprawnienie do wysyłki dla jednego nagrania. Podpis jest liczony przy
     * każdym wydaniu od nowa i nigdzie nie jest zapisywany: serwer nie
     * przechowuje niczego, co pozwalałoby wysyłać bez ponownego uprawnienia.
     */
    private function uploadPermission(string $videoId, string $libraryId, string $apiKey, bool $resumed): JsonResponse
    {
        $expiresAt = now()->addSeconds(LessonRecording::RESUME_WINDOW_SECONDS)->getTimestamp();
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
                'resumed' => $resumed,
            ],
        ], 201);
    }

    /**
     * Stan nagrania lekcji. Prawdą jest stan w bazie; dostawcę pyta wyłącznie
     * `RecordingStateRefresher` — tylko dla stanów nieterminalnych i nie
     * częściej niż raz na próg czasu na lekcję. Gdy dostawca nie odpowie albo
     * odpowie błędem, odpowiedź niesie stan z bazy, bez zmian.
     */
    public function status(Lesson $lesson): JsonResponse
    {
        if (! $this->tokenService->isConfigured()) {
            throw new ApiException(
                503,
                'video_not_configured',
                'Stan przetwarzania jest chwilowo niedostępny — brak konfiguracji dostawcy wideo.',
            );
        }

        $providerLength = $this->refresher->refresh($lesson);
        $recording = LessonRecording::of($lesson);

        // Identyfikator spoza wzorca (zapisany, zanim wzorzec obowiązywał, albo
        // wstawiony poza API) nie wychodzi w zadaniu z kluczem usługi: lekcja
        // wygląda jak lekcja bez nagrania, tak samo jak przy `null`.
        if ($recording->newestId() === null) {
            return response()->json([
                'data' => [
                    'status' => 'no_video',
                    'video_status' => RecordingStatus::NONE,
                    'video_status_at' => null,
                    'video_ready' => false,
                    'video_pending' => false,
                ],
            ]);
        }

        return response()->json([
            'data' => [
                'status' => $this->legacyStatus($recording->status()),
                'duration_seconds' => $providerLength ?? (int) $lesson->duration_seconds,
                'preview_embed_url' => $recording->playedId !== null
                    ? $this->tokenService->signedEmbedUrl($lesson)['url']
                    : null,
                'video_status' => $recording->status(),
                'video_status_at' => $lesson->video_status_at?->toIso8601ZuluString(),
                'video_ready' => $recording->hasPlayable(),
                'video_pending' => $recording->hasPending(),
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
     * Pole `status` sprzed kolumny stanu, zostawione dla dotychczasowych
     * klientów: trzy wartości wyliczane ze stanu najnowszego nagrania.
     * Tłumaczenie stanu dostawcy ma jedno miejsce — `RecordingStatus`.
     */
    private function legacyStatus(?string $status): string
    {
        return match ($status) {
            RecordingStatus::READY => 'finished',
            RecordingStatus::ERROR => 'error',
            default => 'processing',
        };
    }
}
