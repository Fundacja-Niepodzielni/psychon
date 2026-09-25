<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Historia wzorow dokumentow: kazdy zapis w `document_templates` (PUT)
     * dopisuje tu jeden wiersz z numerem wersji, ktory wtedy powstal. Wiersze
     * sa tylko dopisywane - kontroler nigdy ich nie edytuje ani nie usuwa.
     */
    public function up(): void
    {
        Schema::create('document_template_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('document_template_id')->constrained('document_templates')->cascadeOnDelete();
            $table->string('type', 32);
            $table->text('content');
            $table->unsignedInteger('version');
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['document_template_id', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_template_versions');
    }
};
