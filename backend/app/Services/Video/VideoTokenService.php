<?php

namespace App\Services\Video;

use App\Models\Lesson;
use App\Models\User;

/**
 * Podpisywanie dostępu do nagrań Bunny Stream.
 *
 * Cztery klucze (`config('services.bunny')`) czytane z env — dwa z nich
 * (`BUNNY_API_KEY`, `BUNNY_TOKEN_SECURITY_KEY`) są puste w każdym środowisku
 * poza produkcją: kod musi więc rozróżniać "brak konfiguracji" od "błędny
 * podpis" i nigdy nie wybuchać wyjątkiem przy starcie — `isConfigured()`
 * sprawdzają wywołujący PRZED użyciem tego serwisu, żeby ekran i panel bez
 * kluczy dały czytelny komunikat, nie 500.
 *
 * Bunny Stream oferuje DWIE niezależne warstwy podpisu (ten sam
 * `BUNNY_TOKEN_SECURITY_KEY` służy obu — dokumentacja Stream mówi wprost
 * "we can protect the embed view as well as the actual video files itself"
 * https://bunny.net/docs/stream/security-options):
 *   - embed view token authentication (iframe odtwarzacza) — HEX(SHA256(...)),
 *     wzór: https://bunny.net/docs/stream/token-authentication
 *   - CDN token authentication (bezpośrednie URL-e HLS na hoście CDN) —
 *     HMAC-SHA256, wzór "Advanced": https://bunny.net/docs/cdn/security/token-authentication/advanced
 *     Implementacja poniżej to wierny port referencyjnego PHP z
 *     https://github.com/BunnyWay/BunnyCDN.TokenAuthentication (plik
 *     `php/url_signing.php`), zawężony do trybu potrzebnego tutaj: token
 *     katalogowy (`isDirectory=true`) bez IP-locka, bo playlista HLS
 *     odwołuje się do wielu plików segmentów w tym samym katalogu — sam
 *     dokument Stream to podkreśla: "you'll need to use the path style
 *     tokens when protecting a HLS stream to ensure we protect the TS
 *     files too" (https://bunny.net/docs/stream/security-options).
 *
 * Związanie linku CDN z konkretną osobą: referencyjna funkcja
 * `sign_bcdn_url()` (plik jw.) domyślnie wciąga KAŻDY parametr zapytania z
 * podpisywanego URL-a do materiału podpisu — `$parameters = $query_params;`
 * (`url_signing.php`), potem `ksort($parameters);` i dopiero posortowany
 * zbiór trafia do wiadomości HMAC
 * (`$message = $signature_path . $expires . $ip_bytes . $signing_data;`). Dopisanie własnego
 * parametru do URL-a zmienia więc sam podpis, nie tylko treść linku — stąd
 * `viewer` niżej: skrót nieodwracalny wobec surowego ID (HMAC z tym samym
 * kluczem bezpieczeństwa co reszta podpisu), nigdy identyfikator ani e-mail
 * wprost. Dwie osoby proszące w tej samej sekundzie dostają różne URL-e, a
 * URL jednej osoby przestaje się zgadzać, jeśli ktoś podstawi cudzy skrót.
 */
class VideoTokenService
{
    /**
     * TTL linku CDN (HLS): 2 h. Lekcje w katalogu mają maksymalnie
     * ok. 60 minut nagrania (`duration_seconds` w danych demo) — dwie
     * godziny to margines na pauzy i wolne łącze bez potrzeby odświeżania
     * linku w trakcie jednego otwarcia lekcji, a nie dni ważności po
     * zamknięciu karty.
     */
    public const CDN_TTL_SECONDS = 7200;

    /**
     * TTL podpisu iframe (podgląd w panelu admina) — krótszy, bo to
     * jednorazowe otwarcie podglądu, nie pełne obejrzenie lekcji.
     */
    public const EMBED_TTL_SECONDS = 900;

    public function isConfigured(): bool
    {
        return (string) config('services.bunny.api_key') !== ''
            && (string) config('services.bunny.library_id') !== ''
            && (string) config('services.bunny.cdn_hostname') !== ''
            && (string) config('services.bunny.token_security_key') !== '';
    }

    /**
     * Podpisany bezpośredni URL HLS (playlist + segmenty) dla lekcji —
     * token katalogowy (`bcdn_token=`), ważny `CDN_TTL_SECONDS`, związany
     * z osobą, której go wydajemy (patrz nagłówek klasy).
     *
     * @return array{url: string, expires_at: int, video_id: string}
     */
    public function signedCdnUrl(Lesson $lesson, User $user): array
    {
        $videoId = $this->videoId($lesson);
        $expires = now()->getTimestamp() + self::CDN_TTL_SECONDS;
        $tokenPath = "/{$videoId}/";
        $urlPath = "/{$videoId}/playlist.m3u8";
        $viewer = $this->viewerToken($user);

        $signed = $this->signDirectoryPath($tokenPath, $urlPath, $expires, $viewer);

        return [
            'url' => "https://{$this->cdnHostname()}{$signed}",
            'expires_at' => $expires,
            'video_id' => $videoId,
        ];
    }

    /**
     * Podpisany URL iframe (embed view token authentication) — do podglądu
     * wideo w panelu admina, zanim front dostanie własny odtwarzacz.
     *
     * @return array{url: string, expires_at: int, video_id: string}
     */
    public function signedEmbedUrl(Lesson $lesson): array
    {
        $videoId = $this->videoId($lesson);
        $expires = now()->getTimestamp() + self::EMBED_TTL_SECONDS;
        $token = hash('sha256', $this->securityKey().$videoId.$expires);
        $libraryId = (string) config('services.bunny.library_id');

        return [
            'url' => "https://iframe.mediadelivery.net/embed/{$libraryId}/{$videoId}?token={$token}&expires={$expires}",
            'expires_at' => $expires,
            'video_id' => $videoId,
        ];
    }

    /**
     * Skrót osoby wchodzący do podpisu CDN jako dodatkowy parametr zapytania
     * `viewer` (patrz nagłówek klasy). HMAC z tym samym kluczem bezpieczeństwa
     * co reszta podpisu, więc bez tego klucza nie da się go ani odtworzyć,
     * ani podrobić dla cudzego konta.
     */
    private function viewerToken(User $user): string
    {
        return substr(hash_hmac('sha256', 'video-viewer:'.$user->id, $this->securityKey()), 0, 16);
    }

    /**
     * Podpis HMAC-SHA256 "Advanced" (dokumentacja: patrz nagłówek klasy),
     * wariant katalogowy bez IP-locka. Port `sign_bcdn_url()` z
     * referencyjnego repo Bunny, zawężony do tej jednej ścieżki użycia:
     * parametry dodatkowe (tu: `viewer`) wchodzą do podpisu w kolejności
     * alfabetycznej kluczy, jak w referencji (`ksort`) — `token_path` przed
     * `viewer`.
     */
    private function signDirectoryPath(string $tokenPath, string $urlPath, int $expires, string $viewer): string
    {
        $encodedTokenPath = rawurlencode($tokenPath);
        $encodedViewer = rawurlencode($viewer);
        $signingData = "token_path={$tokenPath}&viewer={$viewer}";
        $message = $tokenPath.$expires.$signingData;
        $digest = hash_hmac('sha256', $message, $this->securityKey(), true);
        $token = 'HS256-'.rtrim(strtr(base64_encode($digest), '+/', '-_'), '=');

        return "/bcdn_token={$token}&token_path={$encodedTokenPath}&viewer={$encodedViewer}&expires={$expires}{$urlPath}";
    }

    private function videoId(Lesson $lesson): string
    {
        $videoId = $lesson->video_provider_id;

        if (! is_string($videoId) || $videoId === '') {
            throw new \RuntimeException('Lesson has no Bunny video assigned.');
        }

        return $videoId;
    }

    private function securityKey(): string
    {
        return (string) config('services.bunny.token_security_key');
    }

    private function cdnHostname(): string
    {
        return (string) config('services.bunny.cdn_hostname');
    }
}
