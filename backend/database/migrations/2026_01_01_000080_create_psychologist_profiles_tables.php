<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Graduate psychologist profile with verification attachments (§2.7).
     */
    public function up(): void
    {
        Schema::create('psychologist_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->json('specializations')->nullable();
            $table->string('approach')->nullable(); // therapeutic approach ("nurt")
            $table->string('city')->nullable();
            $table->text('bio')->nullable();
            $table->timestamp('publication_consent_at')->nullable();
            $table->string('status', 16)->default('draft')->index(); // draft | submitted | returned | accepted | published | withdrawn
            $table->text('return_reason')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->string('external_id')->nullable(); // external directory id — phase 2
            $table->timestamps();
        });

        Schema::create('profile_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('profile_id')->constrained('psychologist_profiles')->cascadeOnDelete();
            $table->string('type', 32); // dyplom | niekaralnosc | inne
            $table->string('file_path');
            $table->timestamp('uploaded_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('profile_documents');
        Schema::dropIfExists('psychologist_profiles');
    }
};
