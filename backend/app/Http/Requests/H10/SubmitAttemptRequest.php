<?php

namespace App\Http\Requests\H10;

use App\Models\Course;
use App\Models\Test;
use App\Services\Lessons\LessonAccess;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * POST /tests/{test}/attempts — zestaw odpowiedzi: question_id => answer_id.
 *
 * Każdy klucz musi być pytaniem tego testu, a wartość — odpowiedzią należącą
 * do tego pytania. Odpowiedź spoza pytania → 422 (kontrakt §1.1).
 */
class SubmitAttemptRequest extends FormRequest
{
    /**
     * Kurs testu niewidoczny dla osoby = 404 jeszcze przed walidacją, żeby
     * komunikat o błędnych odpowiedziach nie zdradzał, że test istnieje.
     */
    public function authorize(LessonAccess $lessonAccess): bool
    {
        $user = $this->user();

        if ($user === null) {
            return false;
        }

        $test = $this->route('test');

        if ($test instanceof Test) {
            $test->loadMissing('course');
            $course = $test->course;
            $lessonAccess->assertVisible($user, $course instanceof Course ? $course : null, 'Nie znaleziono zasobu.');
        }

        return true;
    }

    public function rules(): array
    {
        return [
            'answers' => ['required', 'array', 'min:1'],
            'answers.*' => ['required', 'integer'],
        ];
    }

    public function messages(): array
    {
        return [
            'answers.required' => 'Zaznacz odpowiedzi przed wysłaniem testu.',
            'answers.array' => 'Odpowiedzi mają nieprawidłowy format.',
            'answers.min' => 'Zaznacz co najmniej jedną odpowiedź.',
            'answers.*.required' => 'Każde pytanie musi mieć zaznaczoną odpowiedź.',
            'answers.*.integer' => 'Odpowiedź musi być identyfikatorem liczbowym.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            /** @var Test $test */
            $test = $this->route('test');

            $validAnswers = []; // question_id => [answer_id, ...]
            foreach ($test->questions()->with('answers')->get() as $question) {
                $validAnswers[$question->id] = $question->answers->pluck('id')->all();
            }

            foreach ((array) $this->input('answers', []) as $questionId => $answerId) {
                $questionId = (int) $questionId;

                if (! array_key_exists($questionId, $validAnswers)) {
                    $validator->errors()->add(
                        "answers.{$questionId}",
                        'To pytanie nie należy do tego testu.',
                    );

                    continue;
                }

                if (! in_array((int) $answerId, $validAnswers[$questionId], true)) {
                    $validator->errors()->add(
                        "answers.{$questionId}",
                        'Wybrana odpowiedź nie należy do tego pytania.',
                    );
                }
            }
        });
    }
}
