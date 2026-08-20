<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Consents (§2.1), append-only audit log (§2.1, module 15.2)
     * and the sensitive-file access log.
     */
    public function up(): void
    {
        Schema::create('consents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type', 64); // regulamin | polityka | publikacja_profilu | marketing…
            $table->string('document_version', 32)->nullable();
            $table->timestamp('granted_at')->nullable();
            $table->timestamp('withdrawn_at')->nullable(); // withdrawal is a new state, never overwrite
            $table->timestamps();
            $table->index(['user_id', 'type']);
        });

        // INSERT-only: no updated_at, no soft delete. Database-level revoke of
        // UPDATE/DELETE for the app role is an ops task (see docs/system/02 §2.1).
        Schema::create('audit_log', function (Blueprint $table) {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action', 64)->index(); // slugs from the API contract §3.2 only
            $table->string('subject_type')->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->json('details')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['subject_type', 'subject_id']);
        });

        Schema::create('sensitive_access_log', function (Blueprint $table) {
            $table->id();
            $table->foreignId('viewer_id')->constrained('users')->cascadeOnDelete();
            $table->string('file_type', 64); // e.g. diploma_scan | profile_document
            $table->unsignedBigInteger('file_id');
            $table->timestamp('viewed_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sensitive_access_log');
        Schema::dropIfExists('audit_log');
        Schema::dropIfExists('consents');
    }
};
