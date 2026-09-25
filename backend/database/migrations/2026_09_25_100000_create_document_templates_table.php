<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Edytor wzorow dokumentow (zaplecze): jeden wiersz na rodzaj dokumentu
     * (agreement | attendance_certificate | certificate) trzyma tresc
     * wzoru uzywana dzis przez generator zamiast pliku Blade. Unikalnosc na
     * `type` - dokladnie jeden biezacy wzor na rodzaj; historia zmian lezy
     * w `document_template_versions`.
     */
    public function up(): void
    {
        Schema::create('document_templates', function (Blueprint $table) {
            $table->id();
            $table->string('type', 32);
            $table->text('content');
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_templates');
    }
};
