<?php

namespace App\Support\H10;

use App\Models\Test;
use App\Models\TestQuestion;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Pakiet H10 · bank pytań testu końcowego kursu — jedna implementacja dla
 * panelu administracji (`AdminTestQuestionController`) i prowadzącego własnego
 * kursu (`H10\InstructorTestQuestionController`). Kształt odpowiedzi i reguły
 * zapisu są więc te same z założenia, a różni je wyłącznie zasięg żądania
 * (`QuestionBankScope`).
 *
 * Edycja i usuwanie nie ruszają historii — podejścia trzymają własny
 * `questions_snapshot`. Rejestr audytu §3.2 nie przewiduje sluga dla zmian
 * w banku pytań, więc te operacje nie są audytowane.
 */
final class TestQuestionBank
{
    /**
     * @return Collection<int, array<string, mixed>>
     */
    public static function list(Test $test): Collection
    {
        return $test->questions()->with('answers')->get()->map(self::present(...))->values();
    }

    /**
     * @param  array<int, array{body: string, is_correct: bool}>  $answers
     * @return array<string, mixed>
     */
    public static function create(Test $test, string $body, array $answers): array
    {
        $question = DB::transaction(function () use ($test, $body, $answers): TestQuestion {
            // Blokada wiersza testu przed policzeniem numeru. Bez niej dwa
            // równoczesne dodania pytania liczyły ten sam `sequence_order`,
            // a że kolumna nie miała unikatu, kończyło się to nie błędem, lecz
            // dwoma pytaniami o tej samej pozycji — kolejność w teście stawała
            // się nieokreślona, bez żadnego objawu.
            Test::query()->whereKey($test->getKey())->lockForUpdate()->firstOrFail();

            $nextOrder = 1 + (int) $test->questions()->max('sequence_order');

            $question = $test->questions()->create([
                'body' => $body,
                'sequence_order' => $nextOrder,
            ]);

            foreach ($answers as $answer) {
                $question->answers()->create([
                    'body' => $answer['body'],
                    'is_correct' => $answer['is_correct'],
                ]);
            }

            return $question;
        });

        return self::present($question->load('answers'));
    }

    /**
     * @param  array<string, mixed>  $fields  pola pytania obecne w żądaniu (`body`, `sequence_order`)
     * @param  array<int, array<string, mixed>>|null  $answers  null = odpowiedzi bez zmian
     * @return array<string, mixed>
     */
    public static function update(TestQuestion $question, array $fields, ?array $answers): array
    {
        DB::transaction(function () use ($question, $fields, $answers): void {
            $question->fill($fields);
            $question->save();

            if ($answers === null) {
                return;
            }

            $keepIds = [];

            foreach ($answers as $answer) {
                $model = isset($answer['id'])
                    ? $question->answers()->whereKey($answer['id'])->first()
                    : null;

                if ($model === null) {
                    $model = $question->answers()->make();
                }

                $model->body = $answer['body'];
                $model->is_correct = $answer['is_correct'];
                $model->question_id = $question->id;
                $model->save();

                $keepIds[] = $model->id;
            }

            $question->answers()->whereKeyNot($keepIds)->delete();
        });

        /** @var TestQuestion $fresh */
        $fresh = $question->fresh('answers');

        return self::present($fresh);
    }

    /**
     * @return array{id: int, deleted: true}
     */
    public static function delete(TestQuestion $question): array
    {
        $question->delete();

        return ['id' => $question->id, 'deleted' => true];
    }

    /**
     * @return array<string, mixed>
     */
    private static function present(TestQuestion $question): array
    {
        return [
            'id' => $question->id,
            'body' => $question->body,
            'sequence_order' => $question->sequence_order,
            'answers' => $question->answers
                ->sortBy('id')
                ->map(fn ($answer): array => [
                    'id' => $answer->id,
                    'body' => $answer->body,
                    'is_correct' => (bool) $answer->is_correct,
                ])
                ->values(),
        ];
    }
}
