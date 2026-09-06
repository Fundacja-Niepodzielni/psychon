<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * RODO data exports (H01 · M2 pkt 4). One row per "export my data" request;
     * the file itself lands on the `local` disk under exports/. Built in the
     * background by App\Jobs\GenerateDataExport, then Notify::send('export.ready').
     */
    public function up(): void
    {
        Schema::create('data_exports', function (Blueprint $table) {
            $table->id();
            $table->string('public_id', 16)->unique(); // API-facing id, e.g. "ex_9f2a1b7c4"
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('status', 16)->default('queued'); // queued | processing | ready | failed
            $table->string('file_path')->nullable();         // path on the `local` disk
            $table->text('error')->nullable();               // failure reason (dev-facing)
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('data_exports');
    }
};
