<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Program editions (rules live in data, not in code — data model §2.1)
     * and global key/value settings (§2.9).
     */
    public function up(): void
    {
        Schema::create('editions', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->date('starts_at')->nullable();
            $table->date('ends_at')->nullable();
            $table->unsignedSmallInteger('seats_limit')->nullable();
            $table->unsignedTinyInteger('reliability_threshold')->default(60);
            $table->unsignedTinyInteger('test_pass_threshold')->default(80);
            $table->unsignedTinyInteger('test_attempts_limit')->default(3);
            $table->unsignedSmallInteger('internship_hours_required')->default(72);
            $table->unsignedTinyInteger('supervision_required_count')->default(6);
            $table->unsignedTinyInteger('lesson_completion_percent')->default(60); // active-time threshold, distinct from reliability
            $table->string('status', 16)->default('draft'); // draft | active | closed
            $table->timestamps();
        });

        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 64)->unique();
            $table->text('value')->nullable();
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreign('edition_id')->references('id')->on('editions')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['edition_id']);
        });
        Schema::dropIfExists('settings');
        Schema::dropIfExists('editions');
    }
};
