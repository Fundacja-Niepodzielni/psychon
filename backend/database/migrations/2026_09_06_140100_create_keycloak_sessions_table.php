<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Minimal bookkeeping for "our own session" in a backend that is otherwise
 * a pure per-request bearer-token resource server (see
 * `App\Http\Middleware\AuthenticateKeycloakToken` — no server-side session
 * cookie of its own exists). One row per active `sid`, touched on every
 * accepted request and deleted by the back-channel logout write path
 * (unconditionally) or by the read path once a marker is confirmed
 * present. Never consulted for an authorization decision — this table
 * exists only so "destroy our own session on logout" has something
 * concrete to destroy.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('keycloak_sessions', function (Blueprint $table): void {
            $table->string('sid')->primary();
            $table->string('sub')->index();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('keycloak_sessions');
    }
};
