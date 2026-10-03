<?php

namespace App\Support\Emails;

/**
 * One rendered e-mail: subject, the full HTML document (for a real mail),
 * the HTML fragment without `<html>`/`<head>` (for the outbox preview) and
 * the plain-text version.
 */
final readonly class RenderedEmail
{
    public function __construct(
        public string $subject,
        public string $html,
        public string $fragment,
        public string $text,
    ) {}
}
