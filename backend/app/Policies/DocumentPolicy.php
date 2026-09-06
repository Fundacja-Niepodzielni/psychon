<?php

namespace App\Policies;

use App\Models\Document;
use App\Models\User;

/**
 * Ownership only. Non-owners get a boolean `false` from the controller,
 * which is turned into 404 (not 403) — the contract never reveals that a
 * document belonging to someone else exists (§1.1).
 */
class DocumentPolicy
{
    public function view(User $user, Document $document): bool
    {
        return $document->user_id === $user->id;
    }
}
