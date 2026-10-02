<?php

namespace App\Http\Requests\H20;

use App\Services\H20\AuditLogMap;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * GET /admin/audit (+ export.csv) — filtry. `action` ograniczone wyłącznie
 * do sluga z rejestru kontraktu §3.2 (jedyne źródło prawdy o audycie),
 * `group` do grup z `AuditLogMap::GROUPS`; `subject_user_id` i
 * `subject_search` zawężają do osoby, której wpis dotyczy, `user_id` i
 * `actor_search` — do wykonawcy. Strony jak na innych listach administracji
 * (`page` od 1, `per_page` od 1 do 100).
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
        'internship.accepted', 'internship.returned', 'internship.rejected',
        'supervisor.assigned',
        'certificate.issued',
        'document.generated',
        'profile.accepted', 'profile.returned', 'profile.withdrawn',
        'user.created', 'user.updated', 'user.blocked', 'user.anonymized',
        'edition.updated',
        'sensitive.viewed',
        'supervision.attendance_marked',
        'supervision.slot_cancelled',
        'certificate.revoked',
        'legal_document.published', 'legal_document.accepted',
        'notification_settings.updated',
        'cooperation_request.created', 'cooperation_request.answered',
    ];

    public function authorize(): bool
    {
        return true; // rola egzekwowana przez middleware `role:project_manager,super_admin`
    }

    public function rules(): array
    {
        return [
            'action' => ['sometimes', 'nullable', Rule::in(self::ACTIONS)],
            'group' => ['sometimes', 'nullable', Rule::in(array_keys(AuditLogMap::GROUPS))],
            'user_id' => ['sometimes', 'nullable', 'integer'],
            'actor_search' => ['sometimes', 'nullable', 'string', 'max:255'],
            'subject_user_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'subject_search' => ['sometimes', 'nullable', 'string', 'max:255'],
            'from' => ['sometimes', 'nullable', 'date'],
            'to' => ['sometimes', 'nullable', 'date'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return [
            'action.in' => 'Nieznany typ zdarzenia.',
            'group.in' => 'Nieznany rodzaj zdarzeń.',
            'actor_search.max' => 'Szukana fraza może mieć najwyżej 255 znaków.',
            'subject_user_id.integer' => 'Identyfikator osoby musi być liczbą całkowitą.',
            'subject_user_id.min' => 'Identyfikator osoby musi być większy od zera.',
            'subject_search.max' => 'Szukana fraza może mieć najwyżej 255 znaków.',
            'user_id.integer' => 'Identyfikator osoby musi być liczbą całkowitą.',
            'from.date' => 'Podaj poprawną datę początkową.',
            'to.date' => 'Podaj poprawną datę końcową.',
            'page.integer' => 'Numer strony musi być liczbą całkowitą.',
            'page.min' => 'Numer strony musi być większy od zera.',
            'per_page.integer' => 'Liczba pozycji na stronie musi być liczbą całkowitą.',
            'per_page.min' => 'Liczba pozycji na stronie musi być dodatnia.',
            'per_page.max' => 'Na stronie może być najwyżej 100 pozycji.',
        ];
    }
}
