<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Link pobrania dokumentu szedł dotąd po kolejnym numerze wiersza
     * (`documents.id`) — podpisany URL chroni przed podrobieniem, ale sam
     * numer w adresie jest zgadywalny (kolejny dokument to kolejna liczba).
     * `public_id` daje dokumentowi drugi identyfikator, losowy i
     * nieprzewidywalny, do użytku wyłącznie w adresie pobrania — trasa wiąże
     * się po tej kolumnie, nie po `id`.
     */
    public function up(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->uuid('public_id')->nullable()->after('id');
        });

        foreach (DB::table('documents')->select('id')->orderBy('id')->cursor() as $row) {
            DB::table('documents')
                ->where('id', $row->id)
                ->update(['public_id' => (string) Str::uuid()]);
        }

        Schema::table('documents', function (Blueprint $table) {
            $table->uuid('public_id')->nullable(false)->change();
            $table->unique('public_id');
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropUnique(['public_id']);
            $table->dropColumn('public_id');
        });
    }
};
