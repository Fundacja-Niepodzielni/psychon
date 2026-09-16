<?php

namespace App\Policies;

use App\Models\Document;
use App\Models\User;
use App\Services\Auth\TokenRoles;

/**
 * Właścicielka dokumentu albo administracja — te same role co reszta
 * panelu administracyjnego (`project_manager`, `super_admin`; patrz np.
 * trasy H03/H04). Dawniej odmowa dla obcej osoby wracała jako 404, żeby nie
 * zdradzić, że cudzy dokument istnieje (§1.1) — adres pobrania niósł wtedy
 * kolejny numer wiersza. Teraz adres niesie losowy `public_id`, więc
 * zgadnięcie cudzego dokumentu i tak jest nierealne, a kontroler odpowiada
 * jawnym 403.
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
