#!/usr/bin/env bash
# Rotacja zrzutow bazy w deploy/psychon-dev/deploy.sh ma kasowac WYLACZNIE
# zrzuty, ktore sam instrument stworzyl - a dowodem autorstwa jest REJESTR
# (wiersz dopisany po udanym pg_dump, z suma kontrolna tresci), NIGDY sama
# nazwa pliku. Czlon w nazwie ("documents-psychondev-") jest tylko wygoda
# dla czlowieka - obcy plik moze nazywac sie identycznie i wtedy zgodnosc
# nazwy klamie. Katalog kopii na prawdziwym hoscie nie jest pusty i nie jest
# nasz w calosci: obcy plik o nazwie udajacej wlasna MA PRZEZYC, bo nie ma
# wpisu w rejestrze - to jest sedno tej proby, nie dodatek do niej.
#
# Ta wersja deploy.sh nie ma kroku checkoutu po SHA - buduje wprost z
# katalogu, w ktorym lezy. Katalog testowy wiec NIE jest repozytorium git:
# zwykly katalog z kopia deploy.sh pod ta sama wzgledna sciezka
# (`repo_root` liczy sie z polozenia samego siebie, dwa katalogi w gore).
#
# CZESC P1 (pelny bieg, PRAWDZIWY deploy.sh z klonu): katalog kopii ma z gory
# OSIEM obcych plikow "documents-*.sql" o zwyklych nazwach (rozne,
# rozpoznawalne tresci), JEDEN obcy plik o nazwie UDAJACEJ wlasna (znacznik
# w nazwie, ale ZADNEGO wpisu w rejestrze) i DZIEWIEC wlasnych zrzutow
# sprzed biegu (kazdy z prawdziwym wpisem w rejestrze, z suma policzona z
# jego tresci). Bieg dopisuje DZIESIATY wlasny zrzut (aktualny czas, nowy
# wpis w rejestrze) i rotuje rejestr do SIEDMIU najnowszych POZYCJI. Po
# biegu: 8 zwyklych obcych i JEDEN podszywajacy sie maja zostac NIETKNIETE
# (nazwa i tresc), 3 najstarsze WLASNE (z rejestru) maja zniknac z dysku I z
# rejestru (lista nazw skasowanych), 7 najnowszych WLASNYCH ma zostac.
#
# CZESC druga (P2) - rejestr pod swoja nazwa istnieje, ale NIE JEST zwyklym plikiem
# (tu: katalog) - ani zapis nowej pozycji, ani odczyt do rotacji nie moze
# sie udac. To ma dac NIE WIEM w OBU miejscach (zapis i rotacja), z WLASNYM
# wierszem w logu dla kazdego, i zero skasowanych plikow - "nie wiem" nigdy
# nie wolno pomylic z "nic do zrobienia".
#
# Docker/curl/stat sa zaslepkami - zaden prawdziwy kontener, zadna prawdziwa
# siec, zaden prawdziwy pg_dump (stdout pustej zaslepki wchodzi do
# backup_file - plik powstaje pusty, co wystarcza do sprawdzenia NAZW,
# REJESTRU i ROTACJI, ktore mierzy ta proba). `stat` zawsze oddaje "600",
# zeby warunek wstepny na prawach pliku srodowiskowego zawsze przechodzil.
# Prawdziwy `sha256sum` z PATH systemu (nie zaslepiony) liczy sumy - to
# jedyny sposob zmierzenia, czy suma NAPRAWDE sie zgadza albo nie.
#
# Czego ten plik NIE mierzy automatycznie (patrz meldunek wykonawcy):
# kontrola odwrotna (cofniecie poprawki na KOPII pliku, ponowny bieg tej
# samej proby, obce pliki GINA) jest demonstrowana OSOBNO, poza tym
# zestawem - trzymanie na stale w repo DRUGIEJ, celowo wadliwej kopii
# deploy.sh wymagaloby wlasnie pliku, ktorego tresc ma pilnowac hak
# zamrozenia, nie proba.
set -uo pipefail

TU="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SH="$TU/../deploy.sh"

command -v sha256sum >/dev/null 2>&1 || { echo "BLAD: brak sha256sum na tej maszynie - ta proba nie ma jak policzyc sum" >&2; exit 2; }

KATALOGI_TESTOWE=()
PLIKI_TESTOWE=()
trap 'rm -rf "${KATALOGI_TESTOWE[@]}" 2>/dev/null; rm -f "${PLIKI_TESTOWE[@]}" 2>/dev/null' EXIT INT TERM HUP

NIEZALICZONE=0
NAZWY_NIEZALICZONYCH=()

wynik() {
  # $1=nazwa, $2=0 (ok) / 1 (zle)
  if [[ "$2" -eq 0 ]]; then
    echo "  WYNIK: ZALICZONY"
  else
    echo "  WYNIK: NIEZALICZONY"
    NIEZALICZONE=$((NIEZALICZONE + 1))
    NAZWY_NIEZALICZONYCH+=("$1")
  fi
}

# $1=katalog docelowy (juz istnieje, pusty). Kopiuje deploy.sh pod ta sama
# wzgledna sciezke, bo `repo_root` w deploy.sh liczy sie z polozenia samego
# siebie. Zwykly katalog, NIE repozytorium git.
zaloz_katalog_testowy() {
  local dir="$1"
  mkdir -p "$dir/deploy/psychon-dev"
  cp "$DEPLOY_SH" "$dir/deploy/psychon-dev/deploy.sh"
  chmod +x "$dir/deploy/psychon-dev/deploy.sh"
}

# $1=katalog STUB_BIN (juz istnieje). sha256sum NIE jest zaslepiony -
# instrument liczy prawdziwe sumy prawdziwych plikow zaslepki (pustych albo
# z wpisana tresci testowej).
zaloz_zaslepki() {
  local bin="$1"
  cat > "$bin/stat" <<'EOF'
#!/bin/bash
echo 600
EOF
  chmod +x "$bin/stat"

  cat > "$bin/curl" <<'EOF'
#!/bin/bash
out_file=""
dump_file=""
prev=""
for a in "$@"; do
  if [[ "$prev" == "-o" ]]; then out_file="$a"; fi
  if [[ "$prev" == "-D" ]]; then dump_file="$a"; fi
  prev="$a"
done
[[ -n "$out_file" ]] && : > "$out_file"
[[ -n "$dump_file" ]] && printf 'HTTP/1.1 200 OK\r\n\r\n' > "$dump_file"
printf '200'
exit 0
EOF
  chmod +x "$bin/curl"

  cat > "$bin/docker" <<'EOF'
#!/bin/bash
echo "$*" >> "${DOCKER_CALL_LOG:-/dev/null}"
exit 0
EOF
  chmod +x "$bin/docker"
}

# Zasiewa BACKUP_DIR z OSMIOMA obcymi plikami o zwyklych nazwach (rozpoznawalna,
# rozna tresc kazdego) i DZIEWIECIOMA WLASNYMI zrzutami sprzed biegu - dla
# kazdego z nich zapisuje TEZ PRAWDZIWA pozycje w rejestrze (nazwa + suma
# policzona z faktycznej tresci pliku), bo to REJESTR, nie nazwa, jest tu
# dowodem autorstwa. Zwraca listy w OBCE_PRZED / WLASNE_PRZED (posortowane
# jak na dysku / jak wpisane do rejestru - insercja jest chronologiczna).
zasiej_katalog_kopii() {
  local dir="$1" rejestr="$2"
  OBCE_PRZED=()
  local i nazwa suma
  for i in 1 2 3 4 5 6 7 8; do
    nazwa="$(printf 'documents-obcy-uzytkownik-%02d.sql' "$i")"
    printf 'OBCY ZRZUT %d - nie nasz, nie ruszac\n' "$i" > "$dir/$nazwa"
    OBCE_PRZED+=("$nazwa")
  done
  : > "$rejestr"
  WLASNE_PRZED=()
  for i in 1 2 3 4 5 6 7 8 9; do
    nazwa="$(printf 'documents-psychondev-20260101-%06d.sql' "$i")"
    printf 'WLASNY ZRZUT SPRZED BIEGU %d\n' "$i" > "$dir/$nazwa"
    suma="$(sha256sum -- "$dir/$nazwa" | awk '{print $1}')"
    printf '%s\t%s\n' "$nazwa" "$suma" >> "$rejestr"
    WLASNE_PRZED+=("$nazwa")
  done
}

echo "=== P0 bash -n deploy.sh ==="
WYJSCIE_BASHN="$(bash -n "$DEPLOY_SH" 2>&1)"
RC_BASHN=$?
echo "  rc=$RC_BASHN"
[[ -n "$WYJSCIE_BASHN" ]] && printf '%s\n' "$WYJSCIE_BASHN"
wynik "P0 bash -n deploy.sh" "$([[ $RC_BASHN -eq 0 ]] && echo 0 || echo 1)"

# ====================== CZESC pierwsza (P1) - pelny bieg sprzatania =======================
echo "=== P1 pelny bieg: 8 obcych zwyklych + 1 obcy udajacy nasza nazwe (spoza rejestru) NIETKNIETE, wlasne (z rejestru) przyciete do 7 najnowszych ==="
KATALOG="$(mktemp -d)"; KATALOGI_TESTOWE+=("$KATALOG")
zaloz_katalog_testowy "$KATALOG"
STUB="$(mktemp -d)"; KATALOGI_TESTOWE+=("$STUB")
zaloz_zaslepki "$STUB"
ENV_PLIK="$(mktemp)"; PLIKI_TESTOWE+=("$ENV_PLIK")
printf 'STAGING_DOMAIN=przyklad.test\nAUTH_KEYCLOAK_ISSUER=https://idp.przyklad.test/realms/dummy\n' > "$ENV_PLIK"
TLS_DIR="$(mktemp -d)"; KATALOGI_TESTOWE+=("$TLS_DIR")
printf dummy > "$TLS_DIR/origin.crt"; printf dummy > "$TLS_DIR/origin.key"
BACKUP_DIR="$(mktemp -d)"; KATALOGI_TESTOWE+=("$BACKUP_DIR")
REJESTR="$BACKUP_DIR/.rejestr-psychondev-zrzutow.tsv"
LOG="$(mktemp)"; PLIKI_TESTOWE+=("$LOG")

zasiej_katalog_kopii "$BACKUP_DIR" "$REJESTR"
# Obcy plik, ktorego NAZWA udaje nasza (znacznik "documents-psychondev-"),
# ale ktory instrument NIGDY nie stworzyl - wiec NIE MA zadnego wpisu w
# rejestrze dla tej nazwy. To jest wlasnie perturbacja, ktora obalila
# poprzednia wersje (konwencja nazwy zamiast rejestru).
PODSZYWAJACY_SIE="documents-psychondev-19990101-999999.sql"
printf 'OBCY ZRZUT PODSZYWAJACY SIE POD NASZA NAZWE - nie ma go w rejestrze\n' > "$BACKUP_DIR/$PODSZYWAJACY_SIE"

echo "  obce zwykle PRZED (8): ${OBCE_PRZED[*]}"
echo "  obcy podszywajacy sie PRZED (spoza rejestru): $PODSZYWAJACY_SIE"
echo "  wlasne PRZED, wg rejestru (9): ${WLASNE_PRZED[*]}"

WYJSCIE_P1="$(DOCKER_CALL_LOG="$LOG" PATH="$STUB:$PATH" \
  PSYCHON_ENV_FILE="$ENV_PLIK" PSYCHON_TLS_DIR="$TLS_DIR" PSYCHON_DB_BACKUP_DIR="$BACKUP_DIR" \
  bash "$KATALOG/deploy/psychon-dev/deploy.sh" 2>&1)"
RC_P1=$?
echo "  rc=$RC_P1 (oczekiwano 0)"
printf '%s\n' "$WYJSCIE_P1" | grep -F 'Wdrozenie zakonczone' || true
printf '%s\n' "$WYJSCIE_P1" | grep -F 'ROTACJA ZRZUTOW' || true

mapfile -t OBCE_PO < <(cd "$BACKUP_DIR" && ls documents-obcy-*.sql 2>/dev/null | sort)
mapfile -t WLASNE_PO < <([[ -f "$REJESTR" ]] && cut -f1 "$REJESTR")
echo "  obce zwykle PO (oczekiwano tych samych 8, w tej samej kolejnosci): ${OBCE_PO[*]}"
echo "  podszywajacy sie PO: $([[ -f "$BACKUP_DIR/$PODSZYWAJACY_SIE" ]] && echo "$PODSZYWAJACY_SIE (nadal jest)" || echo "ZNIKL")"
echo "  wlasne PO, wg rejestru (oczekiwano 7): ${WLASNE_PO[*]}"

# Skasowane wlasne = te z PRZED, ktorych rejestr JUZ nie wymienia (LISTA
# NAZW, nie liczba).
SKASOWANE_WLASNE=()
for n in "${WLASNE_PRZED[@]}"; do
  obecny=0
  for m in "${WLASNE_PO[@]}"; do [[ "$m" == "$n" ]] && obecny=1; done
  [[ "$obecny" -eq 0 ]] && SKASOWANE_WLASNE+=("$n")
done
echo "  wlasne SKASOWANE, wg rejestru (oczekiwano 3 najstarszych): ${SKASOWANE_WLASNE[*]}"

ZLE=0
[[ "$RC_P1" -ne 0 ]] && ZLE=1
if [[ "${#OBCE_PO[@]}" -ne 8 ]]; then
  echo "  BLAD: liczba obcych zwyklych plikow PO biegu = ${#OBCE_PO[@]}, oczekiwano 8"
  ZLE=1
fi
for i in "${!OBCE_PRZED[@]}"; do
  if [[ "${OBCE_PO[$i]:-}" != "${OBCE_PRZED[$i]}" ]]; then
    echo "  BLAD: obcy plik na pozycji $i to PRZED='${OBCE_PRZED[$i]}' PO='${OBCE_PO[$i]:-brak}' - nazwa sie rozjechala"
    ZLE=1
  fi
  n="${OBCE_PRZED[$i]}"
  oczekiwana="OBCY ZRZUT $((i + 1)) - nie nasz, nie ruszac"
  rzeczywista="$(cat "$BACKUP_DIR/$n" 2>/dev/null)"
  if [[ "$rzeczywista" != "$oczekiwana" ]]; then
    echo "  BLAD: tresc obcego pliku '$n' zmieniona (oczekiwano '$oczekiwana', jest '$rzeczywista')"
    ZLE=1
  fi
done
if [[ ! -f "$BACKUP_DIR/$PODSZYWAJACY_SIE" ]]; then
  echo "  BLAD: obcy plik podszywajacy sie pod nasza nazwe ZOSTAL SKASOWANY - to jest dokladnie wada, ktora ta proba ma zlapac"
  ZLE=1
else
  TRESC_PODSZYWAJACEGO="$(cat "$BACKUP_DIR/$PODSZYWAJACY_SIE" 2>/dev/null)"
  if [[ "$TRESC_PODSZYWAJACEGO" != "OBCY ZRZUT PODSZYWAJACY SIE POD NASZA NAZWE - nie ma go w rejestrze" ]]; then
    echo "  BLAD: tresc obcego pliku podszywajacego sie zmieniona"
    ZLE=1
  fi
fi
if grep -qF "$PODSZYWAJACY_SIE" "$REJESTR" 2>/dev/null; then
  echo "  BLAD: obcy plik podszywajacy sie zostal WPISANY do rejestru - nie powinien tam nigdy trafic"
  ZLE=1
fi
if [[ "${#WLASNE_PO[@]}" -ne 7 ]]; then
  echo "  BLAD: liczba wlasnych pozycji w rejestrze PO biegu = ${#WLASNE_PO[@]}, oczekiwano 7 (7 najnowszych)"
  ZLE=1
fi
if [[ "${#SKASOWANE_WLASNE[@]}" -ne 3 ]]; then
  echo "  BLAD: liczba skasowanych wlasnych = ${#SKASOWANE_WLASNE[@]}, oczekiwano 3"
  ZLE=1
fi
if [[ "${SKASOWANE_WLASNE[*]:-}" != "${WLASNE_PRZED[0]} ${WLASNE_PRZED[1]} ${WLASNE_PRZED[2]}" ]]; then
  echo "  BLAD: skasowane wlasne to nie dokladnie 3 NAJSTARSZE z listy PRZED"
  ZLE=1
fi
for n in "${SKASOWANE_WLASNE[@]}"; do
  [[ -e "$BACKUP_DIR/$n" ]] && { echo "  BLAD: skasowana pozycja '$n' nadal ma plik na dysku"; ZLE=1; }
done
wynik "P1 pelny bieg - 8 obcych zwyklych i 1 obcy udajacy nasza nazwe NIETKNIETE, wlasne z rejestru przyciete do 7 najnowszych" "$ZLE"

# ====================== CZESC druga (P2) - rejestr nie jest zwyklym plikiem ==========
echo "=== P2 rejestr istnieje jako katalog (nie plik): NIE WIEM w zapisie i w rotacji, zero skasowanych, wlasny wiersz w logu dla kazdego ==="
KATALOG2="$(mktemp -d)"; KATALOGI_TESTOWE+=("$KATALOG2")
zaloz_katalog_testowy "$KATALOG2"
STUB2="$(mktemp -d)"; KATALOGI_TESTOWE+=("$STUB2")
zaloz_zaslepki "$STUB2"
ENV_PLIK2="$(mktemp)"; PLIKI_TESTOWE+=("$ENV_PLIK2")
printf 'STAGING_DOMAIN=przyklad.test\nAUTH_KEYCLOAK_ISSUER=https://idp.przyklad.test/realms/dummy\n' > "$ENV_PLIK2"
TLS_DIR2="$(mktemp -d)"; KATALOGI_TESTOWE+=("$TLS_DIR2")
printf dummy > "$TLS_DIR2/origin.crt"; printf dummy > "$TLS_DIR2/origin.key"
BACKUP_DIR2="$(mktemp -d)"; KATALOGI_TESTOWE+=("$BACKUP_DIR2")
REJESTR2="$BACKUP_DIR2/.rejestr-psychondev-zrzutow.tsv"
LOG2="$(mktemp)"; PLIKI_TESTOWE+=("$LOG2")

OBCE2_PRZED=()
for i in 1 2 3 4 5 6 7 8; do
  nazwa2="$(printf 'documents-obcy-uzytkownik-%02d.sql' "$i")"
  printf 'OBCY ZRZUT %d W SCENARIUSZU REJESTRU\n' "$i" > "$BACKUP_DIR2/$nazwa2"
  OBCE2_PRZED+=("$nazwa2")
done
mkdir -p "$REJESTR2"

WYJSCIE_P2="$(DOCKER_CALL_LOG="$LOG2" PATH="$STUB2:$PATH" \
  PSYCHON_ENV_FILE="$ENV_PLIK2" PSYCHON_TLS_DIR="$TLS_DIR2" PSYCHON_DB_BACKUP_DIR="$BACKUP_DIR2" \
  bash "$KATALOG2/deploy/psychon-dev/deploy.sh" 2>&1)"
RC_P2=$?
echo "  rc=$RC_P2 (oczekiwano 0 - problem z ksiegowaniem rejestru NIE ma zatrzymywac calego wdrozenia)"
WIERSZ_NIEWIEM_ZAPIS="$(printf '%s\n' "$WYJSCIE_P2" | grep -F 'NIE WIEM - pod nazwa rejestru' || true)"
WIERSZ_NIEWIEM_ROTACJA="$(printf '%s\n' "$WYJSCIE_P2" | grep -F 'ROTACJA ZRZUTOW: NIE WIEM' || true)"
echo "  wiersz NIE WIEM (zapis nowej pozycji): ${WIERSZ_NIEWIEM_ZAPIS:-BRAK}"
echo "  wiersz NIE WIEM (rotacja/odczyt): ${WIERSZ_NIEWIEM_ROTACJA:-BRAK}"

mapfile -t OBCE2_PO < <(cd "$BACKUP_DIR2" && ls documents-obcy-*.sql 2>/dev/null | sort)
echo "  obce PO (oczekiwano tych samych 8): ${OBCE2_PO[*]}"

ZLE=0
[[ "$RC_P2" -ne 0 ]] && ZLE=1
if [[ -z "$WIERSZ_NIEWIEM_ZAPIS" ]]; then
  echo "  BLAD: brak wiersza NIE WIEM przy probie zapisu nowej pozycji do rejestru"
  ZLE=1
fi
if [[ -z "$WIERSZ_NIEWIEM_ROTACJA" ]]; then
  echo "  BLAD: brak wiersza NIE WIEM przy probie odczytu rejestru do rotacji"
  ZLE=1
fi
if [[ "${#OBCE2_PO[@]}" -ne 8 ]]; then
  echo "  BLAD: liczba obcych plikow PO biegu = ${#OBCE2_PO[@]}, oczekiwano 8 (rotacja NIE mogla nic skasowac, bo nie wiedziala, co jest jej)"
  ZLE=1
fi
for i in "${!OBCE2_PRZED[@]}"; do
  if [[ "${OBCE2_PO[$i]:-}" != "${OBCE2_PRZED[$i]}" ]]; then
    echo "  BLAD: obcy plik na pozycji $i sie rozjechal (PRZED='${OBCE2_PRZED[$i]}', PO='${OBCE2_PO[$i]:-brak}')"
    ZLE=1
  fi
done
if [[ ! -d "$REJESTR2" ]]; then
  echo "  BLAD: rejestr (katalog) zniknal albo zostal zastapiony - nie mial prawa"
  ZLE=1
fi
wynik "P2 rejestr nie jest zwyklym plikiem - NIE WIEM w zapisie i rotacji, zero skasowanych" "$ZLE"

echo
if [[ "$NIEZALICZONE" -eq 0 ]]; then
  echo "PROBY SPRZATANIA WLASNYCH ZRZUTOW: WSZYSTKIE ZALICZONE (0 niezaliczonych)"
  exit 0
else
  echo "PROBY SPRZATANIA WLASNYCH ZRZUTOW: NIEZALICZONE PRZYPADKI ($NIEZALICZONE): ${NAZWY_NIEZALICZONYCH[*]}"
  exit 1
fi
