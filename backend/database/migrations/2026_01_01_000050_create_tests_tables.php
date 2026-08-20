<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Knowledge tests (§2.4): tests, questions, answers, attempts
     * and the on-site workshop completions.
     */
    public function up(): void
    {
        Schema::create('tests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('pass_threshold')->nullable(); // null = edition value
            $table->unsignedTinyInteger('attempts_limit')->nullable(); // null = edition value
            $table->unsignedTinyInteger('question_count')->default(10);
            $table->timestamps();
        });

        Schema::create('test_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('test_id')->constrained()->cascadeOnDelete();
            $table->text('body');
            $table->unsignedSmallInteger('sequence_order')->default(1);
            $table->timestamps();
        });

        Schema::create('test_answers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('question_id')->constrained('test_questions')->cascadeOnDelete();
            $table->text('body');
            $table->boolean('is_correct')->default(false);
            $table->timestamps();
        });

        Schema::create('test_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('test_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('attempt_number'); // computed inside a transaction
            $table->json('answers'); // question_id => answer_id
            $table->json('questions_snapshot'); // question/answer content frozen at attempt time
            $table->unsignedTinyInteger('score_percent');
            $table->boolean('passed')->default(false);
            $table->timestamps();
            $table->unique(['user_id', 'test_id', 'attempt_number']);
        });

        Schema::create('workshop_completions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('edition_id')->constrained()->cascadeOnDelete();
            $table->timestamp('completed_at');
            $table->foreignId('marked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'edition_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workshop_completions');
        Schema::dropIfExists('test_attempts');
        Schema::dropIfExists('test_answers');
        Schema::dropIfExists('test_questions');
        Schema::dropIfExists('tests');
    }
};
