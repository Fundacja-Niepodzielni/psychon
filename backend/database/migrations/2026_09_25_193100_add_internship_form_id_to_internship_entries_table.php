<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Optional link to a dictionary form. The column is nullable, so existing
     * entries stay as they are; the `form` column is left untouched.
     */
    public function up(): void
    {
        Schema::table('internship_entries', function (Blueprint $table) {
            $table->foreignId('internship_form_id')
                ->nullable()
                ->after('form')
                ->constrained('internship_forms')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('internship_entries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('internship_form_id');
        });
    }
};
