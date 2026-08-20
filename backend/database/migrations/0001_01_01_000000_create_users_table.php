<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Users with domain fields (data model §2.1). The foreign key to editions
     * is added in the editions migration (editions are created later).
     */
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('first_name');
            $table->string('last_name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password')->nullable(); // null until the account is activated
            $table->string('phone', 32)->nullable();
            $table->text('address_street')->nullable(); // encrypted at application level
            $table->text('address_city')->nullable();   // encrypted at application level
            $table->text('address_zip')->nullable();    // encrypted at application level
            $table->text('pesel')->nullable();          // encrypted at application level
            $table->string('role', 32)->index();        // super_admin | project_manager | instructor | volunteer | student
            $table->string('status', 16)->default('active'); // active | blocked
            $table->unsignedBigInteger('edition_id')->nullable()->index();
            $table->timestamp('access_expires_at')->nullable();   // null = unlimited
            $table->timestamp('program_completed_at')->nullable(); // null = in progress
            $table->string('product_group', 16)->default('psychon'); // psychon | dobrostan | both
            $table->timestamp('last_login_at')->nullable();
            $table->string('activation_token', 64)->nullable()->unique(); // invitation link (auth/activate)
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('sessions');
    }
};
