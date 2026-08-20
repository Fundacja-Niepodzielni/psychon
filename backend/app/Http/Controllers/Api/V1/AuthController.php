<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ActivateRequest;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    private const int MAX_LOGIN_ATTEMPTS = 5;

    private const int LOGIN_DECAY_SECONDS = 15 * 60; // 5 attempts per 15 minutes

    /**
     * POST /api/v1/auth/login — {email, password} → {data: {token, user}}.
     * The failure message never reveals whether the account exists.
     */
    public function login(LoginRequest $request): JsonResponse
    {
        $throttleKey = 'login:'.sha1(mb_strtolower($request->string('email')).'|'.$request->ip());

        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_LOGIN_ATTEMPTS)) {
            $minutes = (int) ceil(RateLimiter::availableIn($throttleKey) / 60);

            throw new ApiException(
                429,
                'too_many_attempts',
                "Zbyt wiele prób logowania. Spróbuj ponownie za {$minutes} min.",
            );
        }

        $user = User::where('email', mb_strtolower($request->string('email')))->first();

        if ($user === null || $user->password === null || ! Hash::check($request->string('password'), $user->password)) {
            RateLimiter::hit($throttleKey, self::LOGIN_DECAY_SECONDS);

            throw ValidationException::withMessages([
                'email' => ['Nieprawidłowy e-mail lub hasło.'],
            ]);
        }

        if ($user->status === 'blocked') {
            throw new ApiException(403, 'forbidden', 'Konto zostało zablokowane. Skontaktuj się z opiekunem projektu.');
        }

        RateLimiter::clear($throttleKey);

        $user->forceFill(['last_login_at' => now()])->save();

        return response()->json([
            'data' => [
                'token' => $user->createToken('api')->plainTextToken,
                'user' => UserResource::make($user)->resolve(),
            ],
        ]);
    }

    /**
     * POST /api/v1/auth/logout — revokes the current token.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['data' => ['message' => 'Wylogowano.']]);
    }

    /**
     * POST /api/v1/auth/forgot-password — always answers the same way,
     * without revealing whether the account exists. The e-mail (via SMTP →
     * Mailpit in dev) carries a token link to the frontend reset page.
     */
    public function forgotPassword(ForgotPasswordRequest $request): JsonResponse
    {
        Password::sendResetLink($request->only('email'));

        return response()->json([
            'data' => [
                'message' => 'Jeśli konto o podanym adresie istnieje, wysłaliśmy link do ustawienia nowego hasła.',
            ],
        ]);
    }

    /**
     * POST /api/v1/auth/reset-password — {token, email, password}.
     */
    public function resetPassword(ResetPasswordRequest $request): JsonResponse
    {
        $status = Password::reset(
            $request->only('email', 'password', 'token'),
            function (User $user) use ($request): void {
                $user->forceFill(['password' => $request->string('password')->value()])->save();
                $user->tokens()->delete(); // revoke every active session
            },
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'email' => ['Nieprawidłowy lub wygasły link do resetu hasła.'],
            ]);
        }

        return response()->json([
            'data' => ['message' => 'Hasło zostało zmienione. Możesz się zalogować.'],
        ]);
    }

    /**
     * POST /api/v1/auth/activate — {token, password}: sets the password from
     * an invitation (users.activation_token) after application acceptance.
     */
    public function activate(ActivateRequest $request): JsonResponse
    {
        $user = User::where('activation_token', $request->string('token')->value())->first();

        if ($user === null) {
            throw ValidationException::withMessages([
                'token' => ['Nieprawidłowy lub wykorzystany link aktywacyjny.'],
            ]);
        }

        $user->forceFill([
            'password' => $request->string('password')->value(),
            'activation_token' => null,
            'email_verified_at' => $user->email_verified_at ?? now(),
        ])->save();

        return response()->json([
            'data' => ['message' => 'Konto zostało aktywowane. Możesz się zalogować.'],
        ]);
    }
}
