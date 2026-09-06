<?php

namespace App\Http\Requests\H03;

use Illuminate\Foundation\Http\FormRequest;

class StoreApplicationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->role, ['project_manager', 'super_admin'], true);
    }

    public function rules(): array
    {
        return [
            'edition_id' => ['sometimes', 'nullable', 'integer', 'exists:editions,id'],
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'source' => ['sometimes', 'nullable', 'string', 'max:64'],
            'role' => ['sometimes', 'nullable', 'string', 'in:super_admin,project_manager,instructor,volunteer,student'],
            'payload' => ['sometimes', 'nullable', 'array'],
            'university' => ['sometimes', 'nullable', 'string', 'max:255'],
            'graduation_year' => ['sometimes', 'nullable', 'integer', 'min:1900', 'max:'.(now()->year + 1)],
        ];
    }

    public function messages(): array
    {
        return [
            'string' => 'To pole musi być tekstem.',
            'edition_id.integer' => 'Identyfikator edycji musi być liczbą całkowitą.',
            'edition_id.exists' => 'Nie znaleziono wskazanej edycji.',
            'first_name.required' => 'Podaj imię.',
            'first_name.max' => 'Imię jest za długie (maksymalnie 255 znaków).',
            'last_name.required' => 'Podaj nazwisko.',
            'last_name.max' => 'Nazwisko jest za długie (maksymalnie 255 znaków).',
            'email.required' => 'Podaj adres e-mail.',
            'email.email' => 'Podaj poprawny adres e-mail.',
            'email.max' => 'Adres e-mail jest za długi (maksymalnie 255 znaków).',
            'phone.max' => 'Numer telefonu jest za długi.',
            'source.max' => 'Źródło zgłoszenia jest za długie.',
            'role.in' => 'Nieznana rola.',
            'payload.array' => 'Dodatkowe dane zgłoszenia mają nieprawidłowy format.',
            'university.max' => 'Nazwa uczelni jest za długa (maksymalnie 255 znaków).',
            'graduation_year.integer' => 'Rok ukończenia studiów musi być liczbą całkowitą.',
            'graduation_year.min' => 'Rok ukończenia studiów jest nieprawdopodobnie wczesny.',
            'graduation_year.max' => 'Rok ukończenia studiów nie może być w przyszłości.',
        ];
    }
}
