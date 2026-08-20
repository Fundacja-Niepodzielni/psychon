<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Communication (§2.8): in-app notifications, the simulated e-mail outbox
     * and questions to instructors.
     */
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type', 64)->index(); // types from the API contract §3.1 only
            $table->string('title');
            $table->text('body')->nullable();
            $table->string('link')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        Schema::create('emails', function (Blueprint $table) {
            $table->id();
            $table->string('to_email');
            $table->foreignId('to_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('subject');
            $table->text('body_html')->nullable();
            $table->string('status', 16)->default('queued')->index(); // queued | sent | failed | simulated
            $table->string('related_type')->nullable();
            $table->unsignedBigInteger('related_id')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
        });

        Schema::create('instructor_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('lesson_id')->constrained()->cascadeOnDelete();
            $table->text('question');
            $table->text('answer')->nullable();
            $table->foreignId('answered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('answered_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('instructor_questions');
        Schema::dropIfExists('emails');
        Schema::dropIfExists('notifications');
    }
};
