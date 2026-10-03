<?php

namespace App\Http\Attributes;

use Attribute;

/**
 * Marks a controller action that stays reachable after the person's access
 * to the programme has ended (`EnsureAccessActive` lets it through). The
 * action itself must not serve programme content.
 */
#[Attribute(Attribute::TARGET_METHOD)]
final class AvailableAfterAccessEnds {}
