<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Courses and learning (§2.3): courses, lessons, materials,
     * instructor assignments, instructor profiles, lesson progress.
     */
    public function up(): void
    {
        Schema::create('courses', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->string('type', 16)->default('course'); // course | webinar
            $table->string('product_group', 16)->default('psychon'); // psychon | dobrostan | both
            $table->unsignedSmallInteger('sequence_order')->nullable()->index(); // null = outside the sequence
            $table->foreignId('edition_id')->nullable()->constrained()->nullOnDelete();
            $table->boolean('is_published')->default(false);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('lessons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('sequence_order')->default(1);
            $table->string('video_provider_id')->nullable(); // mock Bunny Stream during the hackathon
            $table->unsignedInteger('duration_seconds')->default(0);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('materials', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lesson_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('course_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('file_path');
            $table->string('mime', 128)->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->timestamps();
        });

        Schema::create('course_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_id')->constrained()->cascadeOnDelete();
            $table->foreignId('lesson_id')->nullable()->constrained()->cascadeOnDelete(); // null = whole course
            $table->foreignId('instructor_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('assigned_at')->nullable();
            $table->timestamp('unassigned_at')->nullable();
            $table->timestamps();
        });

        Schema::create('instructor_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->json('specializations')->nullable();
            $table->text('bio')->nullable();
            $table->text('experience')->nullable();
            $table->string('city')->nullable();
            $table->json('responsibilities')->nullable();
            $table->foreignId('supervisor_id')->nullable()->constrained('users')->nullOnDelete(); // the instructor's own supervisor
            $table->timestamps();
        });

        Schema::create('lesson_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('lesson_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('watched_seconds')->default(0); // values only ever grow
            $table->unsignedInteger('active_seconds')->default(0);  // grows only while the tab is active
            $table->unsignedInteger('open_count')->default(0);
            $table->timestamp('last_activity_at')->nullable();
            $table->boolean('is_completed')->default(false);
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'lesson_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lesson_progress');
        Schema::dropIfExists('instructor_profiles');
        Schema::dropIfExists('course_assignments');
        Schema::dropIfExists('materials');
        Schema::dropIfExists('lessons');
        Schema::dropIfExists('courses');
    }
};
