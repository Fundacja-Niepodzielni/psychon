<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H18\AnonymizeUserRequest;
use App\Http\Requests\H18\BlockUserRequest;
use App\Http\Requests\H18\StoreUserRequest;
use App\Http\Requests\H18\UnblockUserRequest;
use App\Http\Requests\H18\UpdateUserRequest;
use App\Http\Resources\AdminUserCardResource;
use App\Http\Resources\AdminUserListResource;
use App\Models\Application;
use App\Models\EmailMessage;
use App\Models\User;
use App\Queries\AdminUserQuery;
use App\Services\H03\ApplicationInvitationMailer;
use App\Services\H18\AccountManagementGuard;
use App\Services\H18\UserAnonymizer;
use App\Services\H18\UserNumberSourcesQuery;
use App\Support\AuditLog;
use App\Support\Csv;
use App\Support\Emails\EmailRenderer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Pakiet H18 · Panel — osoby i karta osoby.
 * Trasy za `role:project_manager,super_admin`, anonimizacja za `role:super_admin`
 * (routes/api/h18.php); reguły kont w `AccountManagementGuard`.
 * Zapis wyłącznie do tabeli `users`; postępy karty pochodzą z
 * `ProgressAggregator` (to samo źródło co pulpit i raport).
 */
class AdminUserController extends Controller
{
    /**
     * Rozwiązywany przy każdym wywołaniu: reguły czytają role z tokenu
     * bieżącego żądania, a instancja kontrolera może przeżyć jedno żądanie.
     */
    private function guard(): AccountManagementGuard
    {
        return app(AccountManagementGuard::class);
    }

    public function index(Request $request): JsonResponse
    {
        $paginator = AdminUserQuery::fromRequest($request)
            ->paginate(AdminUserQuery::perPage($request));

        return response()->json([
            'data' => collect($paginator->items())
                ->map(fn (User $user): array => AdminUserListResource::make($user)->resolve($request))
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

    public function show(Request $request, int $id): JsonResponse
    {
        $user = User::query()->with('consents')->find($id);

        if ($user === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono osoby.');
        }

        return response()->json([
            'data' => AdminUserCardResource::make($user)->resolve($request),
        ]);
    }

    /**
     * Jeden punkt zaplecza, pięć sekcji: wiersze, z których powstała każda
     * z pięciu liczb karty osoby (D-106) — `hours_accepted`,
     * `supervision_present`, `workshop`, `passed_tests`, `reliability`.
     * Istniejące punkty (karta, `/certificate/conditions`,
     * `/admin/reliability/{userId}`) zostają bez zmian; ten punkt jest
     * do wglądu źródeł, nie ich zastąpieniem.
     */
    public function numberSources(Request $request, int $id): JsonResponse
    {
        $user = User::query()->find($id);

        if ($user === null) {
            throw new ApiException(404, 'not_found', 'Nie znaleziono osoby.');
        }

        return response()->json([
            'data' => UserNumberSourcesQuery::for($user),
        ]);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $data = $request->validated();

        $this->guard()->assertMayCreateWithRole($data['role']);

        $existing = User::where('email', $data['email'])->first();

        if ($existing !== null) {
            throw new ApiException(
                409,
                'email_already_registered',
                'Konto z tym adresem e-mail już istnieje.',
                reason: ['existing_user_id' => $existing->id],
            );
        }

        $user = DB::transaction(function () use ($data, $request): User {
            $user = User::create([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'role' => $data['role'],
                'phone' => $data['phone'] ?? null,
                'pesel' => $data['pesel'] ?? null,
                'address_street' => $data['address']['street'] ?? null,
                'address_city' => $data['address']['city'] ?? null,
                'address_zip' => $data['address']['zip'] ?? null,
                'product_group' => $data['product_group'] ?? 'psychon',
                'status' => 'active',
                'activation_token' => Str::random(64),
            ]);

            $this->sendInvitationEmail($user);

            AuditLog::record($request->user(), 'user.created', $user, [
                'role' => $user->role,
            ]);

            return $user;
        });

        return response()->json([
            'data' => AdminUserCardResource::make($user->load('consents'))->resolve($request),
        ], 201);
    }

    public function update(UpdateUserRequest $request, int $id): JsonResponse
    {
        $data = $request->validated();

        $user = DB::transaction(function () use ($data, $request, $id): User {
            // Zmiana roli może zabrać kontu rolę administracyjną: pula aktywnej
            // administracji blokowana przed wierszem celu, jak przy blokadzie.
            $activeAdministrators = array_key_exists('role', $data)
                ? AccountManagementGuard::activeAdministratorPool(lock: true)
                : null;

            $user = User::query()->whereKey($id)->lockForUpdate()->first();

            if ($user === null) {
                throw AccountManagementGuard::notFound();
            }

            $this->guard()->assertMayChangeRole($user, $data['role'] ?? null);

            if ($activeAdministrators !== null && AccountManagementGuard::removesAdministrativeRole($user, $data['role'])) {
                AccountManagementGuard::assertNotLastActiveAdministrator($user, $activeAdministrators);
            }

            if ($activeAdministrators !== null && AccountManagementGuard::removesSuperAdminRole($user, $data['role'])) {
                AccountManagementGuard::assertNotLastActiveSuperAdmin($user, $activeAdministrators);
            }

            $map = [
                'first_name' => 'first_name',
                'last_name' => 'last_name',
                'email' => 'email',
                'role' => 'role',
                'phone' => 'phone',
                'pesel' => 'pesel',
                'product_group' => 'product_group',
            ];

            foreach ($map as $input => $column) {
                if (array_key_exists($input, $data)) {
                    $user->{$column} = $data[$input];
                }
            }

            // Ta sama reguła co w PATCH /me: adres jest scalany, nie zastępowany.
            // Podklucz nieobecny w żądaniu zostaje, jawny null zeruje swoje pole.
            if (array_key_exists('address', $data)) {
                $address = $data['address'] ?? [];
                $columns = ['street' => 'address_street', 'city' => 'address_city', 'zip' => 'address_zip'];

                foreach ($columns as $key => $column) {
                    if (array_key_exists($key, $address)) {
                        $user->{$column} = $address[$key];
                    }
                }
            }

            $changed = array_keys($user->getDirty());

            // Zaproszenie należy do adresu: nowy adres konta, które czeka na
            // pierwsze powiązanie, dostaje nowy token, a stary przestaje działać.
            $renewInvitation = in_array('email', $changed, true)
                && AccountManagementGuard::hasPendingInvitation($user);

            if ($renewInvitation) {
                $user->activation_token = Str::random(64);
            }

            if ($changed !== []) {
                $user->save();

                $details = ['changed' => $changed];

                if ($renewInvitation) {
                    $details['invitation_renewed'] = true;
                }

                AuditLog::record($request->user(), 'user.updated', $user, $details);
            }

            if ($renewInvitation) {
                $this->sendInvitationEmail($user);
                $this->sendApplicationInvitationAfterCommit($user);
            }

            return $user;
        });

        return response()->json([
            'data' => AdminUserCardResource::make($user->load('consents'))->resolve($request),
        ]);
    }

    public function block(BlockUserRequest $request, int $id): JsonResponse
    {
        $reason = $request->validated('reason');

        $user = DB::transaction(function () use ($reason, $request, $id): User {
            // Aktywne konta administracji blokowane zawsze w tej samej kolejności
            // i przed kontem celu: dwie równoległe blokady nie zostawią zera.
            $activeAdministrators = AccountManagementGuard::activeAdministratorPool(lock: true);

            $user = User::query()->whereKey($id)->lockForUpdate()->first();

            if ($user === null) {
                throw AccountManagementGuard::notFound();
            }

            $this->guard()->assertMayManage($user);

            if ($user->isAnonymized()) {
                throw new ApiException(403, 'account_anonymized', 'Konta zanonimizowanego nie można zablokować.');
            }

            AccountManagementGuard::assertNotOwnAccount($user, $request->user(), AccountManagementGuard::cannotBlockSelf());
            AccountManagementGuard::assertNotLastActiveAdministrator($user, $activeAdministrators);

            $user->status = 'blocked';
            $user->save();

            AuditLog::record($request->user(), 'user.blocked', $user, [
                'reason' => $reason,
            ]);

            return $user;
        });

        return response()->json([
            'data' => AdminUserCardResource::make($user->load('consents'))->resolve($request),
        ]);
    }

    /**
     * Cofnięcie blokady (kontrakt, aneks z 2026-10-02). Konto, które nigdy
     * nie zostało powiązane z Kontami Niepodzielni, wraca do `invited` — inaczej
     * ominęłoby wiązanie przy pierwszym logowaniu. Termin dostępu bez zmian.
     */
    public function unblock(UnblockUserRequest $request, int $id): JsonResponse
    {
        $user = DB::transaction(function () use ($request, $id): User {
            $user = User::query()->whereKey($id)->lockForUpdate()->first();

            if ($user === null) {
                throw AccountManagementGuard::notFound();
            }

            $this->guard()->assertMayManage($user);

            if ($user->isAnonymized()) {
                throw new ApiException(403, 'account_anonymized', 'Konta zanonimizowanego nie można odblokować.');
            }

            if ($user->status !== 'blocked') {
                throw new ApiException(403, 'account_not_blocked', 'To konto nie jest zablokowane.');
            }

            $previousStatus = $user->status;
            $restoredStatus = ($user->keycloak_sub === null || $user->keycloak_sub === '') ? 'invited' : 'active';

            $user->status = $restoredStatus;
            $user->save();

            AuditLog::record($request->user(), 'user.unblocked', $user, [
                'previous_status' => $previousStatus,
                'restored_status' => $restoredStatus,
            ]);

            return $user;
        });

        return response()->json([
            'data' => AdminUserCardResource::make($user->load('consents'))->resolve($request),
        ]);
    }

    /**
     * Right-to-erasure procedure (art. 17, non-functional spec §2 pt. 4):
     * personal data on the row is replaced, the row itself stays so every
     * result, attempt and certificate that references it keeps working.
     * Route is `role:super_admin` only (routes/api/h18.php); the target
     * loses its account entirely (no more login, no more of its own tokens),
     * so this is one-way — there is no matching "un-anonymize".
     */
    public function anonymize(AnonymizeUserRequest $request, int $id): JsonResponse
    {
        $target = User::query()->find($id);

        if ($target === null) {
            throw AccountManagementGuard::notFound();
        }

        $this->guard()->assertMayManage($target);

        // Własne konto i ostatnie aktywne konto administracji UserAnonymizer
        // sprawdza ponownie na zablokowanych wierszach.
        $user = UserAnonymizer::run($target, $request->user());

        return response()->json([
            'data' => AdminUserCardResource::make($user->load('consents'))->resolve($request),
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $users = AdminUserQuery::fromRequest($request)->get();

        $rows = [AdminUserListResource::FIELDS];

        foreach ($users as $user) {
            $rows[] = AdminUserListResource::make($user)->toCsvRow($request);
        }

        return Csv::download('osoby.csv', $rows);
    }

    private function activationUrl(User $user): string
    {
        return rtrim(config('app.frontend_url'), '/').'/aktywacja?token='.$user->activation_token;
    }

    /**
     * Konto z przyjętego zgłoszenia dostało pierwsze zaproszenie prawdziwą
     * wiadomością — ponowione zaproszenie idzie tą samą drogą, po zatwierdzeniu
     * transakcji (wycofana zmiana nie zostawia wysłanej wiadomości).
     */
    private function sendApplicationInvitationAfterCommit(User $user): void
    {
        $application = Application::query()
            ->where('user_id', $user->id)
            ->where('status', 'accepted')
            ->orderByDesc('decided_at')
            ->first();

        if ($application === null) {
            return;
        }

        $activationUrl = $this->activationUrl($user);

        DB::afterCommit(static function () use ($application, $user, $activationUrl): void {
            ApplicationInvitationMailer::send($application, $user, $activationUrl);
        });
    }

    /**
     * Zaproszenie E-03 do konta założonego przez administrację — dziś tylko
     * ślad w skrzynce e-maili (stan „simulated”).
     */
    private function sendInvitationEmail(User $user): void
    {
        $email = EmailRenderer::render('E-03', ['activationPath' => '/aktywacja?token='.$user->activation_token]);

        EmailMessage::create([
            'to_email' => $user->email,
            'to_user_id' => $user->id,
            'subject' => $email->subject,
            'body_html' => $email->fragment,
            'status' => 'simulated',
            'sent_at' => now(),
        ]);
    }
}
