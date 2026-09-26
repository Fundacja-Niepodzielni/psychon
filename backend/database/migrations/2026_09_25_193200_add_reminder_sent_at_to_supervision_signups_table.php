<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Marks that the day-before reminder was sent. The reminder command skips
     * signups that already carry it, so a second run creates no duplicate.
     */
    public function up(): void
    {
        Schema::table('supervision_signups', function (Blueprint $table) {
            $table->timestamp('reminder_sent_at')->nullable()->after('cancelled_at');
        });
    }

    public function down(): void
    {
        Schema::table('supervision_signups', function (Blueprint $table) {
            $table->dropColumn('reminder_sent_at');
        });
    }
};
