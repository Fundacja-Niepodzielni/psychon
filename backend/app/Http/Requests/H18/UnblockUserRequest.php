<?php

namespace App\Http\Requests\H18;

use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /admin/users/{id}/unblock — odblokowanie konta (H18). Bez ciała:
 * żadna reguła nie wyprzedza sprawdzenia dostępu w kontrolerze, a audyt
 * `user.unblocked` nie dostaje wolnego tekstu (kontrakt §3.2, aneks z 2026-10-02).
 */
class UnblockUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // rola sekcji sprawdzana middlewarem `role:` na trasie
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }
}
