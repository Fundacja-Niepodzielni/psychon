<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Marks the moment an account went through the anonymisation procedure
     * (right to erasure, art. 17). Personal columns on `users` are overwritten
     * in place — the row itself is never deleted, so every foreign key that
     * points at it (results, attempts, certificates, statistics) keeps
     * working. `status` gains a third value (`deleted`, next to the existing
     * `active`/`blocked`) for admin listings; this timestamp is the precise,
     * unambiguous marker the rest of the code checks against. Nullable and
     * additive: rows created before this change simply have no value here.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('anonymized_at')->nullable()->after('program_completed_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('anonymized_at');
        });
    }
};
