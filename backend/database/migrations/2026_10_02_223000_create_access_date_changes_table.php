<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Rekord zmian daty dostępu: kto, komu, z jakiej daty na jaką i z jakiego
     * powodu. Powód wpisany ręcznie żyje tu, w rekordzie dziedzinowym, a nie
     * w dzienniku zdarzeń — stąd anonimizacja konta może go usunąć.
     */
    public function up(): void
    {
        Schema::create('access_date_changes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('previous_expires_at')->nullable();
            $table->timestamp('new_expires_at');
            $table->text('reason'); // ≤ 1000 znaków, pilnuje walidacja żądania
            $table->timestamp('created_at')->useCurrent();

            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('access_date_changes');
    }
};
