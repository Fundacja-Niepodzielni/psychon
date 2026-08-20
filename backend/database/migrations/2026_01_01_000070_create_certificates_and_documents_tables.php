<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Certificates with public verification (§2.6) and generated documents.
     */
    public function up(): void
    {
        Schema::create('certificates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('edition_id')->constrained()->cascadeOnDelete();
            $table->string('number', 32)->unique(); // sequential per edition, e.g. NP/2026/001
            $table->timestamp('issued_at');
            $table->string('pdf_path')->nullable();
            $table->string('verification_token', 64)->unique(); // for the QR code
            $table->json('conditions_snapshot')->nullable(); // conditions state at issue time
            $table->timestamp('revoked_at')->nullable();
            $table->text('revoked_reason')->nullable();
            $table->timestamps();
        });

        Schema::create('documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('edition_id')->constrained()->cascadeOnDelete(); // numbering per type and edition
            $table->string('type', 32); // volunteer_agreement | internship_certificate
            $table->string('number', 32);
            $table->json('data_snapshot')->nullable(); // profile data at generation time
            $table->string('pdf_path')->nullable();
            $table->timestamp('generated_at')->nullable();
            $table->string('signature_status', 16)->default('none'); // none | signed_offline | e_signed
            $table->timestamps();
            $table->unique(['edition_id', 'type', 'number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documents');
        Schema::dropIfExists('certificates');
    }
};
