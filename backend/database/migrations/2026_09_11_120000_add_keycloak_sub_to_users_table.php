<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Stage E1 (most SSO): the ONLY link between a Keycloak `sub` (Konta
     * Niepodzielni) and a local `users` row. Nullable and additive — a row
     * created before this change, or never bound to an SSO identity, simply
     * has no value here and keeps using the password path. Unique so two
     * local accounts can never claim the same external identity; binding
     * happens exclusively via the one-time invitation token or the operator
     * command, never by e-mail (identity contract).
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('keycloak_sub')->nullable()->unique()->after('activation_token');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('keycloak_sub');
        });
    }
};
