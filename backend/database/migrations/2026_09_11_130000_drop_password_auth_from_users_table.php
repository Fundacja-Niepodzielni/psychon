<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * PsychON is SSO-only (Konta Niepodzielni / Keycloak) — the owner's
     * decision: the whole password mechanism goes away, and there is no
     * transition period or migration path (development environment, no
     * users). `users.activation_token` STAYS — it is the binding token for
     * `POST /api/v1/sso/powiaz`, not a password-reset artefact.
     *
     * The `0001_01_01_000000_create_users_table.php` and
     * `2026_08_07_103920_create_personal_access_tokens_table.php`
     * migrations that originally created these columns/tables are frozen
     * (`tests/Przyrzad/migracje-zamrozone.sums`) — this is a new, additive
     * migration, run on top of them, never an edit to either.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['password', 'remember_token']);
        });

        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('personal_access_tokens');
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('password')->nullable()->after('email_verified_at');
            $table->rememberToken();
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });
    }
};
