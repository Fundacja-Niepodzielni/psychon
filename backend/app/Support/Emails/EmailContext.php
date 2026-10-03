<?php

namespace App\Support\Emails;

use Illuminate\Support\HtmlString;

/**
 * State of one pass of rendering an e-mail template. Each template is
 * rendered twice from the same blocks: once as HTML, once as plain text.
 * Blocks read the format here and the layout records the subject.
 *
 * In the text pass every block writes its text between markers; the
 * renderer joins the blocks with a blank line and ignores the white space
 * of the template source around them.
 */
final class EmailContext
{
    public const string TEXT = 'text';

    public const string HTML = 'html';

    private const string MARK = "\u{1E}";

    private const string SEPARATOR = "\u{1F}";

    public ?string $subject = null;

    public function __construct(
        public readonly string $format,
        public readonly string $number,
        public readonly string $preheader = '',
    ) {}

    public static function current(): self
    {
        return app(self::class);
    }

    public function isText(): bool
    {
        return $this->format === self::TEXT;
    }

    public function isTeam(): bool
    {
        return EmailTemplates::isTeam($this->number);
    }

    public function switchableByPerson(): bool
    {
        return EmailTemplates::switchMode($this->number) === EmailTemplates::PERSON;
    }

    /**
     * One block of the text version.
     */
    public function textBlock(string $kind, string $text): HtmlString
    {
        return new HtmlString(self::MARK.$kind.self::SEPARATOR.$text.self::MARK);
    }

    /**
     * @return list<array{kind: string, text: string}>
     */
    public static function textBlocks(string $rendered): array
    {
        preg_match_all('/'.self::MARK.'([a-z_]+)'.self::SEPARATOR.'(.*?)'.self::MARK.'/su', $rendered, $matches, PREG_SET_ORDER);

        return array_map(fn (array $match): array => ['kind' => $match[1], 'text' => $match[2]], $matches);
    }

    /**
     * Text of a slot: values in slots are HTML-escaped by Blade, the text
     * version gets them back exactly as typed.
     */
    public static function plain(mixed $html): string
    {
        return htmlspecialchars_decode((string) $html, ENT_QUOTES);
    }

    /**
     * A line of running text from the template source: white space of the
     * source (line breaks, indentation) becomes single spaces.
     */
    public static function flow(mixed $html): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', (string) $html));
    }

    /**
     * The Foundation's contact as it stands in running text, or null when it
     * is not set — templates then leave the whole contact out.
     */
    public function contact(): ?HtmlString
    {
        $value = EmailContact::value();

        return $value === null ? null : new HtmlString(e($value));
    }
}
