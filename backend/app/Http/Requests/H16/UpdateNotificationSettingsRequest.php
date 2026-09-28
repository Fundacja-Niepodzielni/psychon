<?php

namespace App\Http\Requests\H16;

use App\Support\NotificationSettings;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * PATCH /admin/notification-settings — częściowa aktualizacja.
 *
 * `types.*.type` przyjmuje wyłącznie kody z kontraktu §3.1 bez `supervision.reminder`
 * (ten typ ma osobny blok) — kod spoza listy albo `supervision.reminder` w `types`
 * kończy się tym samym `422 validation_failed` przez regułę `in`.
 * `supervision_reminder.send_at` przyjmuje wyłącznie pełną godzinę `HH:00` (00–23).
 */
class UpdateNotificationSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'types' => ['sometimes', 'array'],
            'types.*' => ['array:type,enabled'],
            'types.*.type' => ['required_with:types', 'string', 'distinct', Rule::in(NotificationSettings::TYPES)],
            'types.*.enabled' => ['required_with:types', 'boolean'],

            'supervision_reminder' => ['sometimes', 'array:enabled,send_at'],
            'supervision_reminder.enabled' => ['sometimes', 'boolean'],
            'supervision_reminder.send_at' => ['sometimes', 'string', 'regex:/^([01]\d|2[0-3]):00$/'],
        ];
    }

    public function messages(): array
    {
        return [
            'types.*.type.in' => 'Nieznany typ powiadomienia.',
            'types.*.type.distinct' => 'Typ powiadomienia powtarza się na liście.',
            'types.*.enabled.required_with' => 'Określ, czy typ ma być włączony.',
            'types.*.enabled.boolean' => 'Pole musi mieć wartość tak albo nie.',
            'supervision_reminder.enabled.boolean' => 'Pole musi mieć wartość tak albo nie.',
            'supervision_reminder.send_at.regex' => 'Godzina musi mieć postać HH:00 (00–23).',
        ];
    }
}
