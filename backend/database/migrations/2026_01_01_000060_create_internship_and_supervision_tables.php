<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Internship diary and supervision (§2.5).
     */
    public function up(): void
    {
        Schema::create('internship_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->decimal('hours', 5, 1); // only `accepted` entries count towards the 72 h
            $table->string('form', 32); // phone_duty | chat_duty | other
            $table->unsignedSmallInteger('consultations_count')->default(0);
            $table->text('description')->nullable(); // no personal data of consulted persons
            $table->string('status', 16)->default('submitted')->index(); // submitted | accepted | returned
            $table->text('review_comment')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('supervisor_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('volunteer_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('supervisor_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('assigned_at')->nullable();
            $table->timestamp('unassigned_at')->nullable(); // history preserved
            $table->timestamps();
        });

        Schema::create('supervision_slots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supervisor_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('starts_at');
            $table->unsignedSmallInteger('duration_minutes')->default(90);
            $table->unsignedTinyInteger('seats_limit')->default(3);
            $table->string('location_or_link')->nullable();
            $table->timestamps();
        });

        Schema::create('supervision_signups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('slot_id')->constrained('supervision_slots')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('signed_up_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('attendance', 8)->nullable(); // null | present | absent
            $table->foreignId('attendance_marked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['slot_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supervision_signups');
        Schema::dropIfExists('supervision_slots');
        Schema::dropIfExists('supervisor_assignments');
        Schema::dropIfExists('internship_entries');
    }
};
