<?php

namespace App\Http\Requests\H20;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GET /admin/audit (+ export.csv) — filtry. `action` ograniczone wyłącznie
 * do sluga z rejestru kontraktu §3.2 (jedyne źródło prawdy o audycie).
 */
class AuditIndexRequest extends FormRequest
{
    /**
     * Rejestr zdarzeń audytowych — kontrakt §3.2. Zmiana wyłącznie przez
     * strażnika kontraktu.
     */
    public const array ACTIONS = [
        'application.accepted', 'application.rejected',
        'access.extended',
        'course.created', 'course.updated', 'course.deleted',
        'assignment.created', 'assignment.removed',
        'attempt.finished', 'attempts.reset', 'workshop.completed',
        'internship.accepted', 'internship.returned',
        'supervisor.assigned',
        'certificate.issued',
        'document.generated',
        'profile.accepted', 'profile.returned', 'profile.withdrawn',
        'user.created', 'user.updated', 'user.blocked',
        'edition.updated',
        'sensitive.viewed',
    ];

    public function authorize(): bool
    {
        return true; // rola egzekwowana przez middleware `role:project_manager,super_admin`
    }

    public function rules(): array
    {
        return [
            'action' => ['sometimes', 'nullable', Rule::in(self::ACTIONS)],
            'user_id' => ['sometimes', 'nullable', 'integer'],
            'from' => ['sometimes', 'nullable', 'date'],
            'to' => ['sometimes', 'nullable', 'date'],
        ];
    }

    public function messages(): array
    {
        return [
            'action.in' => 'Nieznany typ zdarzenia.',
        ];
    }
}
