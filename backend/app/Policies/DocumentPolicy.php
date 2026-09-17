<?php

namespace App\Policies;

use App\Models\Document;
use App\Models\User;
use App\Services\Auth\TokenRoles;

/**
 * Właścicielka dokumentu albo administracja — te same role co reszta
 * panelu administracyjnego (`project_manager`, `super_admin`; patrz np.
 * trasy H03/H04). Odmowa dla obcej osoby wraca z kontrolera jako 404, tak
 * samo jak dla nieistniejącego dokumentu (§1.1) — żeby sama odpowiedź nie
 * zdradzała, że pod danym `public_id` w ogóle coś jest.
 */
class DocumentPolicy
{
    public function __construct(private readonly TokenRoles $tokenRoles) {}

    public function view(User $user, Document $document): bool
    {
        return $document->user_id === $user->id
            || $this->tokenRoles->has('project_manager', 'super_admin');
    }
}
