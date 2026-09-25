<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Zaplecze czatu pomocy: jedna tabela na zgloszenie z okna pomocy.
     * `role` i `screen` to migawka z chwili wyslania (rola z tokena, sciezka
     * ekranu frontu) — nie odczyt biezacego stanu konta, wiec `user_id` jest
     * `nullOnDelete`, tak jak `sender_id` w `messages`: konta nie sa tu
     * twardo kasowane, ale historia zgloszenia ma przetrwac ewentualne
     * odpiecie konta.
     *
     * `reference` jest `nullable`: numer zgloszenia (np. "POM-000123")
     * powstaje z wlasnego `id` wiersza, wiec zapis idzie w dwoch krokach
     * (insert, potem update w tej samej transakcji) — `NULL` nie koliduje
     * z `UNIQUE` w PostgreSQL, wiec chwilowy stan przed nadaniem numeru
     * nigdy nie blokuje rownoleglych zgloszen.
     */
    public function up(): void
    {
        Schema::create('help_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('role', 32);
            $table->string('screen', 200);
            $table->text('content');
            $table->string('reference')->nullable()->unique();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('help_messages');
    }
};
