<?php

namespace App\Support\Emails;

use Illuminate\Support\Facades\View;
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

        [$textContext, $textOutput] = self::pass(new EmailContext(EmailContext::TEXT, $number), $data);
        $blocks = EmailContext::textBlocks($textOutput);
        $text = implode("\n\n", array_column($blocks, 'text'))."\n";

        [$htmlContext, $html] = self::pass(new EmailContext(EmailContext::HTML, $number, self::preheader($blocks)), $data);
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
            $output = View::make(
                EmailTemplates::view($context->number),
                ['contact' => $context->contact(), ...$data],
            )->render();
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
}
