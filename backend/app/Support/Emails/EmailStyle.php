<?php

namespace App\Support\Emails;

/**
 * Atoms of the e-mail look — colours, type and spacing — with exactly the
 * values of the approved design (`docs/e-maile-wyglad/buduj.py`), taken from
 * the light theme of the application. E-mail clients do not read CSS
 * variables or alpha, so every value is a flat, inline one.
 */
final class EmailStyle
{
    public const array COLOR = [
        'bg' => '#f3f1ed',
        'card' => '#ffffff',
        'border' => '#e6e4df',
        'ink' => '#1a1a1a',
        'text' => '#323232',
        'muted' => '#5f5d58',
        'brand' => '#1500bb',
        'link' => '#594ef9',
        'primary' => '#00803a',
        'on_primary' => '#ffffff',
        'warn' => '#8a5a00',
        // --brand-tint and --warn-bg laid over the white card.
        'brand_tint' => '#eeedfa',
        'warn_bg' => '#fef3e1',
    ];

    public const string FONT = "Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

    /**
     * Type scale: size, line height, weight (px).
     */
    public const array TYPE = [
        'brand' => [20, 20, 900],
        'body' => [16, 24, 400],
        'button' => [16, 20, 500],
        'title' => [15, 20, 700],
        'small' => [13, 20, 400],
    ];

    public const string TABLE = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"';

    /**
     * Inline style of a text element: one step of the type scale in one colour.
     */
    public static function text(string $kind, ?string $color = null, string $extra = ''): string
    {
        [$size, $lineHeight, $weight] = self::TYPE[$kind];

        return sprintf(
            'margin:0;font-family:%s;font-size:%dpx;line-height:%dpx;font-weight:%d;color:%s;%s',
            self::FONT,
            $size,
            $lineHeight,
            $weight,
            $color ?? self::COLOR['text'],
            $extra,
        );
    }

    /**
     * Opening of one row of the layout card, with its top and bottom spacing.
     */
    public static function rowStart(int $top, int $bottom = 0): string
    {
        return sprintf('<tr><td style="padding:%dpx 24px %dpx 24px;">', $top, $bottom);
    }

    public const string ROW_END = '</td></tr>';
}
