<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Material;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * H05 · streams one course material behind a temporary signed link.
 *
 * The link is what a plain <a href download> can follow: the SPA keeps its
 * token in localStorage, so a browser-initiated download carries no
 * Authorization header — this route runs no `auth:keycloak` and never will.
 *
 * R2 (sprint-2 §1) fixed WHERE the access token's grants decide who gets a
 * link: at ISSUANCE (`MaterialResource`, built inside the authenticated
 * GET /courses/{slug} request, from THAT request's `TokenRoles`), never
 * here. This controller consults none of that — Konta granting or taking
 * away something after the link was handed out has no effect until the
 * link's own TTL runs out (consciously, the TTL ceiling below keeps that
 * window short). What IS re-checked at download: the signature and its
 * expiry (`signed` middleware on the route), that the link's remaining
 * life does not exceed the configured ceiling, that `u` still names an
 * existing account, and that the account is not blocked/deleted/anonymized
 * since issuance.
 */
class MaterialDownloadController extends Controller
{
    public function __invoke(Request $request, Material $material): StreamedResponse
    {
        $this->assertLinkWithinCeiling($request);

        $user = User::query()->find($request->integer('u'));

        if ($user === null) {
            throw $this->notFound();
        }

        $this->assertAccountUsable($user);

        $disk = Storage::disk('local');

        if (! $disk->exists($material->file_path)) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono pliku materiału.');
        }

        return $disk->download($material->file_path, $material->name, [
            'Content-Type' => $material->mime,
        ]);
    }

    /**
     * The `signed` middleware already refuses a link once its own `expires`
     * timestamp is in the past. This adds the other half: a link may never
     * carry MORE remaining life than `courses.material_link_ttl_seconds`,
     * whoever produced it — `MaterialResource` never asks for more, so this
     * only ever fires on a link that should not exist.
     */
    private function assertLinkWithinCeiling(Request $request): void
    {
        $expiresAt = $request->query('expires');
        $ttl = (int) config('courses.material_link_ttl_seconds');

        if (! is_numeric($expiresAt) || (int) $expiresAt - now()->getTimestamp() > $ttl) {
            throw new ApiException(403, 'link_expired', 'Ten link do pobrania już wygasł.');
        }
    }

    /**
     * Account state — a fact about the account itself, unlike the access
     * token's grants, so R2 permits reading it here. Same check
     * `KeycloakGuardResolver`/`SsoBindController` apply on every other route.
     */
    private function assertAccountUsable(User $user): void
    {
        if (in_array($user->status, ['blocked', 'deleted'], true) || $user->anonymized_at !== null) {
            throw new ApiException(403, 'forbidden', 'To konto nie jest aktywne. Skontaktuj się z opiekunem projektu.');
        }

        // The signed route carries no `access.active` middleware — there is no
        // session for it to run against — so the time-boxed gate is re-applied
        // here by hand, with the same code and message as EnsureAccessActive.
        // Without it a link issued while access was still active would outlive
        // the access itself for up to the signature's TTL window. Same
        // category as the block/anonymize check above: an account-level date.
        if ($user->program_completed_at === null
            && $user->access_expires_at !== null
            && $user->access_expires_at->isPast()) {
            throw new ApiException(
                403,
                'access_expired',
                'Twój dostęp do materiałów wygasł. Skontaktuj się z opiekunem projektu.',
            );
        }
    }

    private function notFound(): ApiException
    {
        return new ApiException(404, 'not_found', 'Nie znaleziono materiału.');
    }
}
