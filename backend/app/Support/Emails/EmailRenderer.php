<?php

namespace App\Support\Emails;

use Illuminate\Contracts\View\View;
use InvalidArgumentException;

/**
 * Renders one e-mail template into its subject, HTML and plain text.
 */
final class EmailRenderer
{
    /** Kinds of text blocks whose text can open the inbox preview. */
    private const array CONTENT = ['paragraph', 'details', 'next_steps'];

    private const int PREHEADER_LENGTH = 110;

    /**
     * @param  array<string, mixed>  $data
     */
    public static function render(string $number, array $data = []): RenderedEmail
    {
        $missing = EmailTemplates::missing($number, $data);

        if ($missing !== []) {
            throw new InvalidArgumentException("E-mail {$number} needs: ".implode(', ', $missing).'.');
        }

        $contact = EmailContact::value();

        [$textContext, $textOutput] = self::pass(new EmailContext(EmailContext::TEXT, $number, $contact), $data);
        $blocks = EmailContext::textBlocks($textOutput);
        $text = implode("\n\n", array_column($blocks, 'text'))."\n";

        [$htmlContext, $html] = self::pass(new EmailContext(EmailContext::HTML, $number, $contact, self::preheader($blocks)), $data);
        $html = trim($html)."\n";

        preg_match('#<body[^>]*>\s*(.*?)\s*</body>#s', $html, $body);

        return new RenderedEmail(
            (string) $htmlContext->subject,
            $html,
            $body[1] ?? '',
            $text,
        );
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{0: EmailContext, 1: string}
     */
    private static function pass(EmailContext $context, array $data): array
    {
        $previous = app()->bound(EmailContext::class) ? app(EmailContext::class) : null;
        app()->instance(EmailContext::class, $context);

        try {
            $output = self::template($context->number, [
                'contact' => $context->contact(),
                'hasContact' => $context->hasContact(),
                ...$data,
            ])->render();
        } finally {
            if ($previous instanceof EmailContext) {
                app()->instance(EmailContext::class, $previous);
            } else {
                app()->forgetInstance(EmailContext::class);
            }
        }

        return [$context, $output];
    }

    /**
     * Hidden text the inbox shows next to the subject: the beginning of the
     * first block of the content.
     *
     * @param  list<array{kind: string, text: string}>  $blocks
     */
    private static function preheader(array $blocks): string
    {
        foreach ($blocks as $block) {
            if (! in_array($block['kind'], self::CONTENT, true)) {
                continue;
            }

            $text = trim((string) preg_replace('/\s+/u', ' ', $block['text']));

            if (mb_strlen($text) <= self::PREHEADER_LENGTH) {
                return $text;
            }

            $cut = mb_substr($text, 0, self::PREHEADER_LENGTH);
            $space = mb_strrpos($cut, ' ');

            return ($space === false ? $cut : mb_substr($cut, 0, $space)).'…';
        }

        return '';
    }

    /**
     * The template of each e-mail, named by a literal: application code never
     * picks a view by a computed name.
     *
     * @param  array<string, mixed>  $data
     */
    private static function template(string $number, array $data): View
    {
        return match ($number) {
            'E-01' => view('emails.e-01', $data),
            'E-02' => view('emails.e-02', $data),
            'E-03' => view('emails.e-03', $data),
            'E-04' => view('emails.e-04', $data),
            'E-05' => view('emails.e-05', $data),
            'E-08' => view('emails.e-08', $data),
            'E-09' => view('emails.e-09', $data),
            'E-10' => view('emails.e-10', $data),
            'E-11' => view('emails.e-11', $data),
            'E-12' => view('emails.e-12', $data),
            'E-13' => view('emails.e-13', $data),
            'E-14' => view('emails.e-14', $data),
            'E-15' => view('emails.e-15', $data),
            'E-16' => view('emails.e-16', $data),
            'E-17' => view('emails.e-17', $data),
            'E-18' => view('emails.e-18', $data),
            'E-19' => view('emails.e-19', $data),
            'E-20' => view('emails.e-20', $data),
            'E-21' => view('emails.e-21', $data),
            'E-22' => view('emails.e-22', $data),
            'E-23' => view('emails.e-23', $data),
            'E-24' => view('emails.e-24', $data),
            'E-25' => view('emails.e-25', $data),
            'E-26' => view('emails.e-26', $data),
            'E-27' => view('emails.e-27', $data),
            'E-29' => view('emails.e-29', $data),
            'E-30' => view('emails.e-30', $data),
            'E-31' => view('emails.e-31', $data),
            'E-32' => view('emails.e-32', $data),
            'E-33' => view('emails.e-33', $data),
            'E-34' => view('emails.e-34', $data),
            'E-35' => view('emails.e-35', $data),
            'E-36' => view('emails.e-36', $data),
            'E-37' => view('emails.e-37', $data),
            'E-38' => view('emails.e-38', $data),
            'E-39' => view('emails.e-39', $data),
            'E-40' => view('emails.e-40', $data),
            'E-41' => view('emails.e-41', $data),
            default => throw new InvalidArgumentException("Unknown e-mail {$number}."),
        };
    }
}
