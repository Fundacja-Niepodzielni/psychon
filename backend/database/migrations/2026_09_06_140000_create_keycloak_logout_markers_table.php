<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The invalidation-marker store for OIDC back-channel logout (contract
 * §4.5 / §4.5a). A row's PRESENCE is the only thing that decides
 * invalidation — never its content, never its age. No `updated_at`: a
 * marker is written once and never modified, only ever read by `sid` or
 * deleted by a future cleanup job (not part of this slice) keyed on
 * `created_at` with a threshold at least as long as the realm's SSO
 * session max lifespan — never the access token's much shorter TTL.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('keycloak_logout_markers', function (Blueprint $table): void {
            $table->string('sid')->primary();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('keycloak_logout_markers');
    }
};
