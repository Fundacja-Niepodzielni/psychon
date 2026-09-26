<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Treść wzoru dokumentu zapisywana z panelu trafia do `Blade::render()`
 * (`App\Services\DocumentTemplates\DocumentTemplateRenderer`), więc każda
 * dyrektywa Blade i każde wyrażenie PHP we wzorze wykonałoby się na serwerze.
 * Reguła przepuszcza wyłącznie to, czego używają wzory z repozytorium:
 * komentarze `{{-- --}}` i wstawki `{{ $pole }}`, `{{ $obiekt->pole }}`,
 * `{{ $pole ?? 'tekst' }}`. Odrzuca znaczniki PHP, surowe wyjście `{!! !!}`,
 * dyrektywy (`@php`, `@include`, …) i wstawki z wywołaniem funkcji.
 *
 * Przegląd ASVS: `docs/bezpieczenstwo/przeglad-asvs-dane.md`, wiersze V5.2.4,
 * V5.2.5, V5.2.8, V12.3.6.
 */
class SafeDocumentTemplate implements ValidationRule
{
    /** Reguły CSS zaczynające się od `@`, które Blade zostawia bez zmian. */
    private const array CSS_AT_RULES = ['page', 'media', 'font-face', 'charset', 'supports', 'keyframes'];

    private const string ECHO_PATTERN = '/^\s*\$[A-Za-z_]\w*(?:\??->[A-Za-z_]\w*)*(?:\s*\?\?\s*\'[^\'\\\\]*\')?\s*$/';

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            return;
        }

        $content = (string) preg_replace('/\{\{--.*?--\}\}/s', '', $value);

        if (str_contains($content, '<?') || str_contains($content, '{!!')) {
            $fail('Wzór nie może zawierać kodu PHP ani surowego wyjścia {!! !!}.');

            return;
        }

        preg_match_all('/\B@(@?[A-Za-z_][\w-]*)/', $content, $directives);

        foreach ($directives[1] as $directive) {
            if (! in_array(strtolower($directive), self::CSS_AT_RULES, true)) {
                $fail("Wzór nie może zawierać dyrektywy @{$directive}. Dozwolone są tylko wstawki {{ \$pole }}.");

                return;
            }
        }

        preg_match_all('/\{\{(.*?)\}\}/s', $content, $echoes);

        foreach ($echoes[1] as $expression) {
            if (preg_match(self::ECHO_PATTERN, $expression) !== 1) {
                $fail('Wstawka {{'.$expression.'}} jest niedozwolona. Dozwolone są tylko pola, np. {{ $first_name }} albo {{ $user->last_name }}.');

                return;
            }
        }
    }
}
