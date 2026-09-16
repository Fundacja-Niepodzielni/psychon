<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Who revoked a certificate, next to the existing `revoked_at` and
     * `revoked_reason` (2026_01_01_000070). Nullable and additive: every
     * certificate issued before this change simply has no value here.
     * Same "actor" shape as `decided_by`/`marked_by` elsewhere — nullable
     * so the account can later be anonymised without breaking the record.
     */
    public function up(): void
    {
        Schema::table('certificates', function (Blueprint $table) {
            $table->foreignId('revoked_by')->nullable()->after('revoked_reason')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('certificates', function (Blueprint $table) {
            $table->dropConstrainedForeignId('revoked_by');
        });
    }
};
