<?php

namespace App\Http\Requests\H10;

use App\Models\Test;
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
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'answers' => ['required', 'array', 'min:1'],
            'answers.*' => ['required', 'integer'],
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
