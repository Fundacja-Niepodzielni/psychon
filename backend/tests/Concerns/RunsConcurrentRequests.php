<?php

namespace Tests\Concerns;

use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;

/**
 * Maszyneria pomiaru współbieżnego: rozwidlenie procesów z barierą startu.
 *
 * Wydzielona, bo to piąty świadek potrzebujący dokładnie tego samego. Kopiowana
 * dalej zaczęłaby się rozjeżdżać między plikami — a wtedy różnice w WYNIKACH
 * byłyby nie do odróżnienia od różnic w PRZYRZĄDZIE, co jest najgorszą rzeczą,
 * jaka może się przydarzyć narzędziu pomiarowemu.
 *
 * Bariera jest tu istotą, nie ozdobą: bez niej procesy startują kolejno i pomiar
 * mierzy sekwencję, udając wyścig. Dokładnie tak wyglądał `ConcurrentAttemptTest`
 * przed poprawką — nazwa mówiła „Concurrent", kształt mówił „po kolei".
 *
 * Trzy istniejące świadki (H13, H10×2) mają jeszcze własne kopie tej pętli;
 * przeniesienie ich tutaj jest osobną robotą i celowo nie robię jej w tej samej
 * turze, w której powstały ich wyniki — zmiana przyrządu i publikacja wyniku
 * z tego przyrządu nie powinny dzielić jednego commita.
 */
trait RunsConcurrentRequests
{
    /**
     * Uruchamia `$ile` procesów, wypuszcza je JEDNOCZEŚNIE i zwraca ich wyniki.
     *
     * @param  callable(int): string  $zadanie  dostaje numer procesu, zwraca ślad do zapisania
     * @return list<string>
     */
    protected function rownolegle(int $ile, callable $zadanie): array
    {
        $katalog = sys_get_temp_dir().'/psy-rownolegle-'.uniqid('', true);
        mkdir($katalog);
        $start = $katalog.'/start';
        $potomkowie = [];

        for ($i = 0; $i < $ile; $i++) {
            $pid = pcntl_fork();

            if ($pid === -1) {
                $this->fail('Nie udało się rozwidlić procesu — pomiar współbieżny jest niemożliwy.');
            }

            if ($pid === 0) {
                DB::purge(); // własne połączenie w procesie potomnym
                file_put_contents($katalog.'/gotowy-'.$i, 'x');

                while (! file_exists($start)) {
                    usleep(1000);
                }

                try {
                    $slad = $zadanie($i);
                } catch (\Throwable $wyjatek) {
                    $slad = str_contains($wyjatek->getMessage(), '23505')
                        ? 'wyjatek:unikat'
                        : 'wyjatek:'.mb_substr($wyjatek->getMessage(), 0, 40);
                }

                file_put_contents($katalog.'/wynik-'.$i, $slad);
                exit(0);
            }

            $potomkowie[] = $pid;
        }

        for ($proba = 0; $proba < 20000; $proba++) {
            if (count(glob($katalog.'/gotowy-*')) === $ile) {
                break;
            }
            usleep(1000);
        }

        $this->assertCount(
            $ile,
            glob($katalog.'/gotowy-*'),
            'Nie wszystkie procesy doszły do bariery — to NIE był pomiar współbieżny.',
        );

        file_put_contents($start, 'start');

        foreach ($potomkowie as $pid) {
            pcntl_waitpid($pid, $status);
        }

        $wyniki = array_map(
            static fn (string $sciezka): string => trim((string) file_get_contents($sciezka)),
            glob($katalog.'/wynik-*'),
        );

        foreach (glob($katalog.'/*') as $plik) {
            @unlink($plik);
        }
        @rmdir($katalog);

        return $wyniki;
    }

    /**
     * Ślad odpowiedzi HTTP z ROZPOZNANĄ przyczyną przy błędzie serwera.
     *
     * Samo „500" jest zagadką, nie pomiarem — nie odróżnia wyścigu o numer
     * od awarii przyrządu, a to jest różnica między znaleziskiem a fałszywym alarmem.
     */
    protected function sladOdpowiedzi(TestResponse $odpowiedz): string
    {
        $slad = (string) $odpowiedz->status();

        if ($odpowiedz->status() >= 500) {
            $tresc = (string) $odpowiedz->getContent();
            $slad .= str_contains($tresc, '23505') ? ':unikat' : ':inna-przyczyna';
        }

        return $slad;
    }
}
