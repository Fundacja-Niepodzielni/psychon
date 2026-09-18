<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Legal documents with versions (pakiet H22). Content is delivered by
     * the Foundation — this migration only shapes the storage. A published
     * version is immutable (enforced in the controller, not here); a new
     * version is a new row, never an edit of a published one.
     */
    public function up(): void
    {
        Schema::create('legal_document_versions', function (Blueprint $table) {
            $table->id();
            $table->string('type', 32); // regulamin | polityka
            $table->string('version', 32);
            $table->text('content');
            $table->string('status', 16)->default('draft'); // draft | published
            $table->timestamp('published_at')->nullable();
            $table->timestamps();

            $table->unique(['type', 'version']);
            $table->index(['type', 'status', 'published_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legal_document_versions');
    }
};
