<?php

namespace App\Support\Emails;

use App\Models\User;
use Illuminate\Database\Eloquent\Collection;

/**
 * Recipients of the e-mails about the Foundation's own matters (E-17, E-39,
 * E-41): every active Opiekun Projektu and every active Super Admin, each
 * separately. Inactive accounts get nothing.
 */
final class FoundationTeam
{
    public const array ROLES = ['project_manager', 'super_admin'];

    /**
     * @return Collection<int, User>
     */
    public static function members(): Collection
    {
        return User::query()
            ->whereIn('role', self::ROLES)
            ->where('status', 'active')
            ->whereNull('anonymized_at')
            ->orderBy('id')
            ->get();
    }
}
