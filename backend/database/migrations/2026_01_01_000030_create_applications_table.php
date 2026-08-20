<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Candidate applications (§2.2) — entered/imported from the Foundation's
     * external form; an account is created after acceptance.
     */
    public function up(): void
    {
        Schema::create('applications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('edition_id')->constrained()->cascadeOnDelete();
            $table->string('first_name');
            $table->string('last_name');
            $table->string('email');
            $table->string('phone', 32)->nullable();
            $table->string('source', 64)->nullable();
            $table->string('role', 32)->default('volunteer'); // proposed account role from the form
            $table->json('payload')->nullable();
            $table->string('university')->nullable();
            $table->unsignedSmallInteger('graduation_year')->nullable();
            $table->string('diploma_scan_path')->nullable();
            $table->string('status', 16)->default('new')->index(); // new | accepted | rejected
            $table->text('rejection_reason')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete(); // account created after acceptance
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('applications');
    }
};
