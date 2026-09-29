#!/usr/bin/env bash
# Test-swiadek Y1 (ANEKS 5 miara (b) / ANEKS 6 p.3): obcy proces na porcie,
# ktorego uzyje `uruchom.sh`, PRZEZYWA probe: bieg konczy sie kodem 2 z
# wierszem `PORT ZAJETY: <port> PID <pid>`, BEZ zabijania czegokolwiek, a
# atrapa nadal nasluchuje na tym samym porcie i pod tym samym PID po probie.
#
# Mechanizm (ten sam co w `uruchom.sh`): atrapa to WLASNY proces node tego
# skryptu; jej PID Windows jest ustalany przez `/proc/<pid>/winpid` zaraz po
# starcie i to WYLACZNIE ten zapisany PID Windows sprzata ten skrypt na
# koncu (`taskkill //T`) - nigdy po porcie ani po nazwie.
#
# Uzycie: bash swiadek-port-zajety.sh
# Kod wyjscia: 0 = swiadek potwierdzony w calosci; 1 = swiadek NIE
# potwierdzony (patrz log); 2 = przygotowanie atrapy sie nie udalo (np. brak
# wolnego portu) - nie jest to wynik samego swiadka.
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAN="$TU/.stan/swiadek-port-zajety-$$-$(date +%s)"
mkdir -p "$STAN"
chmod 700 "$STAN"
LOG="$STAN/log.txt"
: > "$LOG"
log() {
    printf '[swiadek-port-zajety] %s\n' "$*" >> "$LOG"
    printf '[swiadek-port-zajety] %s\n' "$*" >&2
}

# Odczyt WYLACZNIE (netstat -ano): PID Windows nasluchujacy (LISTENING) na
# danym porcie, puste gdy port wolny. Ten sam wzorzec co `port_pid` w
# `uruchom.sh` - nigdy do wyboru celu zabicia, wylacznie do odczytu stanu.
port_pid() {
    netstat -ano 2>/dev/null | grep "LISTENING" | grep ":$1 " | awk '{print $NF}' | sort -u | head -1
}

# PID Windows faktyczny dla PID MSYS (Git Bash/MSYS: /proc/<pid>/winpid).
winpid_z_msys() {
    local mpid="$1"
    if [ -r "/proc/$mpid/winpid" ]; then
        cat "/proc/$mpid/winpid" 2>/dev/null
    fi
}

# ---------------------------------------------------------------------------
# 1) Wybierz wolny port >=56000 dla atrapy (odczyt netstat, nie polaczenie
#    TCP) - to BEDZIE port frontu, ktory podamy `uruchom.sh` przez
#    PSYCHON_PORT_FRONT.
# ---------------------------------------------------------------------------
ATRAPA_PORT=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
    proba=$(( (RANDOM % 3000) + 56000 ))
    if [ -z "$(port_pid "$proba")" ]; then ATRAPA_PORT="$proba"; break; fi
done
if [ -z "$ATRAPA_PORT" ]; then
    log "ODMOWA (kod 2) - brak wolnego portu na atrape po 10 probach."
    exit 2
fi
log "atrapa: wybrany port $ATRAPA_PORT"

# ---------------------------------------------------------------------------
# 2) Atrapa: wlasny, prosty serwer node nasluchujacy na tym porcie. Port
#    przekazany zmienna srodowiskowa (nie argv - unika niejednoznacznosci
#    `node -e` z dodatkowymi argumentami).
# ---------------------------------------------------------------------------
ATRAPA_PORT_ENV="$ATRAPA_PORT" node -e "require('http').createServer(()=>{}).listen(Number(process.env.ATRAPA_PORT_ENV), '127.0.0.1')" \
    > "$STAN/atrapa.log" 2>&1 &
ATRAPA_PID=$!
sleep 1
ATRAPA_WINPID="$(winpid_z_msys "$ATRAPA_PID")"
log "atrapa PID MSYS=$ATRAPA_PID PID Windows=${ATRAPA_WINPID:-brak}"
if [ -z "$ATRAPA_WINPID" ]; then
    log "ODMOWA (kod 2) - nie udalo sie ustalic PID Windows atrapy; nie sprzatalbym jej bezpiecznie po sobie, przerywam."
    kill "$ATRAPA_PID" 2>/dev/null || true
    exit 2
fi

PID_PRZED="$(port_pid "$ATRAPA_PORT")"
if [ -z "$PID_PRZED" ]; then
    log "ODMOWA (kod 2) - atrapa nie nasluchuje na porcie $ATRAPA_PORT wedlug netstat; przerywam."
    taskkill //F //T //PID "$ATRAPA_WINPID" >/dev/null 2>&1 || true
    exit 2
fi
log "atrapa potwierdzona na porcie $ATRAPA_PORT (netstat PID: $PID_PRZED)"

WYNIK=0

# ---------------------------------------------------------------------------
# 3) Wlasciwa proba: `uruchom.sh` z PSYCHON_PORT_FRONT=<port atrapy>.
#    Oczekiwane: kod 2, wiersz "PORT ZAJETY: <port> PID <pid>", ZANIM
#    cokolwiek innego (IdP/baza/zaplecze) zostanie postawione - port bazy i
#    zaplecza sa sprawdzane pierwsze, ale sa losowe wiec wolne; port frontu
#    (wymuszony) jest sprawdzany jako trzeci, przed sekcja "1) IdP
#    efemeryczny".
# ---------------------------------------------------------------------------
log "uruchamiam uruchom.sh z PSYCHON_PORT_FRONT=$ATRAPA_PORT (oczekiwany kod 2, PORT ZAJETY, bez stawiania czegokolwiek)..."
BIEG_LOG="$STAN/bieg.log"
PSYCHON_PORT_FRONT="$ATRAPA_PORT" bash "$TU/uruchom.sh" > "$BIEG_LOG" 2>&1
BIEG_KOD=$?
cat "$BIEG_LOG" >> "$LOG"
log "uruchom.sh zakonczyl sie kodem $BIEG_KOD."

if [ "$BIEG_KOD" != "2" ]; then
    log "SWIADEK NIEUDANY - oczekiwany kod 2 od uruchom.sh, otrzymano $BIEG_KOD."
    WYNIK=1
fi

if grep -q "PORT ZAJETY: $ATRAPA_PORT PID" "$BIEG_LOG"; then
    log "wiersz PORT ZAJETY obecny w logu biegu:"
    grep "PORT ZAJETY: $ATRAPA_PORT PID" "$BIEG_LOG" >> "$LOG"
else
    log "SWIADEK NIEUDANY - brak wiersza 'PORT ZAJETY: $ATRAPA_PORT PID ...' w logu biegu ($BIEG_LOG)."
    WYNIK=1
fi

# ---------------------------------------------------------------------------
# 4) Atrapa musi PRZEZYC: ten sam PID wciaz na tym samym porcie.
# ---------------------------------------------------------------------------
PID_PO="$(port_pid "$ATRAPA_PORT")"
if [ "$PID_PO" = "$PID_PRZED" ] && [ -n "$PID_PO" ]; then
    log "atrapa PRZEZYLA - ten sam PID ($PID_PO) nadal nasluchuje na porcie $ATRAPA_PORT po probie uruchom.sh."
else
    log "SWIADEK NIEUDANY - PID na porcie $ATRAPA_PORT zmienil sie z '$PID_PRZED' na '${PID_PO:-brak}'."
    WYNIK=1
fi

# ---------------------------------------------------------------------------
# 5) Sprzatanie atrapy: WYLACZNIE po jej WLASNYM zapisanym PID Windows.
# ---------------------------------------------------------------------------
log "sprzatam atrape po jej wlasnym zapisanym PID Windows ($ATRAPA_WINPID)..."
taskkill //F //T //PID "$ATRAPA_WINPID" >> "$LOG" 2>&1 || true
sleep 1
if [ -z "$(port_pid "$ATRAPA_PORT")" ]; then
    log "port $ATRAPA_PORT wolny po zdjeciu atrapy (netstat: brak LISTENING)."
else
    log "UWAGA - port $ATRAPA_PORT nadal zajety po probie zdjecia atrapy (patrz log wyzej)."
fi

log "wynik koncowy swiadka: $WYNIK (0=potwierdzony, 1=NIEudany)"
log "log pelny: $LOG"
exit "$WYNIK"
