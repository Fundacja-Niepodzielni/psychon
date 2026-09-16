<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Czat asynchroniczny osoba-prowadzący / grupowy: tabele wątków i wiadomości.
     *
     * `message_threads.supervisor_id` zawsze wskazuje prowadzącego, którego
     * to jest wątek; `volunteer_id` jest wypełnione WYŁĄCZNIE dla wątku
     * `individual` (druga strona pary) i puste dla `group` — grupowy wątek
     * NIE duplikuje członkostwa, tylko czyta je na żywo z `supervisor_assignments`
     * (`volunteer_id`, `supervisor_id`, `unassigned_at`) w warstwie zapytań.
     *
     * Konta nigdy nie są twardo kasowane w tym repozytorium (stan przez
     * `status`/`anonymized_at`) — mimo to klucze obce na wiadomościach są
     * `nullOnDelete`, nie `cascadeOnDelete`: usunięcie konta nie ma kasować
     * cudzej historii rozmowy (otwarte pytanie o los wiadomości po usunięciu
     * konta — decyzja właściciela produktu).
     */
    public function up(): void
    {
        Schema::create('message_threads', function (Blueprint $table) {
            $table->id();
            $table->string('type', 16)->index(); // individual | group
            $table->foreignId('supervisor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('volunteer_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['supervisor_id', 'type']);
            $table->index(['volunteer_id', 'type']);
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('thread_id')->constrained('message_threads')->cascadeOnDelete();
            $table->foreignId('sender_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('body');
            $table->timestamps();

            $table->index(['thread_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('messages');
        Schema::dropIfExists('message_threads');
    }
};
