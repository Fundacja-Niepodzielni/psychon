<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\H18\BlockUserRequest;
use App\Http\Requests\H18\StoreUserRequest;
use App\Http\Requests\H18\UpdateUserRequest;
use App\Http\Resources\AdminUserCardResource;
use App\Http\Resources\AdminUserListResource;
use App\Models\EmailMessage;
use App\Models\User;
use App\Queries\AdminUserQuery;
use App\Support\AuditLog;
use App\Support\Csv;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Pakiet H18 · Panel — osoby i karta osoby.
 * Wszystkie trasy za `role:project_manager,super_admin` (routes/api/h18.php).
 * Zapis wyłącznie do tabeli `users`; postępy karty pochodzą z
 * `ProgressAggregator` (to samo źródło co pulpit i raport).
 */
class AdminUserController extends Controller
{
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

    public function store(StoreUserRequest $request): JsonResponse
    {
        $data = $request->validated();

        $this->assertMayAssignRole($request->user(), $data['role'], null);

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
                'password' => null,
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
            $user = User::query()->whereKey($id)->lockForUpdate()->first();

            if ($user === null) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono osoby.');
            }

            $this->assertMayAssignRole($request->user(), $data['role'] ?? null, $user);

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

            if (array_key_exists('address', $data)) {
                $user->address_street = $data['address']['street'] ?? null;
                $user->address_city = $data['address']['city'] ?? null;
                $user->address_zip = $data['address']['zip'] ?? null;
            }

            $changed = array_keys($user->getDirty());

            if ($changed !== []) {
                $user->save();

                AuditLog::record($request->user(), 'user.updated', $user, [
                    'changed' => $changed,
                ]);
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
            $user = User::query()->whereKey($id)->lockForUpdate()->first();

            if ($user === null) {
                throw new ApiException(404, 'not_found', 'Nie znaleziono osoby.');
            }

            $this->assertMayAssignRole($request->user(), null, $user);

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

    public function export(Request $request): StreamedResponse
    {
        $users = AdminUserQuery::fromRequest($request)->get();

        $rows = [AdminUserListResource::FIELDS];

        foreach ($users as $user) {
            $rows[] = AdminUserListResource::make($user)->toCsvRow($request);
        }

        return Csv::download('osoby.csv', $rows);
    }

    /**
     * Matryca ról (design.md D4): `project_manager` nie utworzy ani nie nada
     * roli `super_admin` i nie zmienia kont, które już ją mają. Rzut przed
     * zapisem i audytem, więc audyt nie rośnie.
     */
    private function assertMayAssignRole(User $actor, ?string $requestedRole, ?User $target): void
    {
        if ($actor->role !== 'project_manager') {
            return;
        }

        if ($requestedRole === 'super_admin' || $target?->role === 'super_admin') {
            throw new ApiException(
                403,
                'forbidden',
                'Tylko Super Admin może zarządzać kontami Super Admina.',
            );
        }
    }

    private function sendInvitationEmail(User $user): void
    {
        EmailMessage::create([
            'to_email' => $user->email,
            'to_user_id' => $user->id,
            'subject' => 'Zaproszenie do platformy Fundacji Niepodzielni',
            'body_html' => 'Twoje konto zostało utworzone. Ustaw hasło, korzystając z linku aktywacyjnego: '
                .'<a href="/aktywacja?token='.$user->activation_token.'">Aktywuj konto</a>.',
            'status' => 'simulated',
            'sent_at' => now(),
        ]);
    }
}
