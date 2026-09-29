<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Treść lekcji w podzbiorze Markdown (bez HTML), do 20 000 znaków —
     * limit pilnuje walidacja żądania, nie kolumna. `description` zostaje
     * krótkim opisem; lekcja bez treści ma `null`.
     */
    public function up(): void
    {
        Schema::table('lessons', function (Blueprint $table) {
            $table->text('content')->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('lessons', function (Blueprint $table) {
            $table->dropColumn('content');
        });
    }
};
