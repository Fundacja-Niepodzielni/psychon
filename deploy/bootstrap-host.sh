#!/usr/bin/env bash
# Bootstrap hosta (Ubuntu 24.04). Uruchamiany jako root NA HOSCIE.
#
# Idempotentny z zalozenia: kazdy krok najpierw SPRAWDZA stan, a zmienia tylko
# to, czego brakuje, i podbija licznik ZMIAN. Drugi przebieg ma wypisac ZMIAN=0
# - to jest swiadek idempotencji, a nie zapewnienie w dokumentacji.
#
# Czego ten skrypt NIE robi (celowo):
#   - nie zaklada zadnego sekretu i nie czyta .env - te tworzy wlasciciel,
#   - nie dotyka panelu dostawcy ani DNS,
#   - nie otwiera portow innych niz 22/80/443.
set -uo pipefail

ZMIAN=0
BLEDY=0
STREFA="${STREFA_CZASOWA:-Europe/Warsaw}"
KATALOG_STOSU="${KATALOG_STOSU:-/opt/psychon}"
KATALOG_BRAMEK="${KATALOG_BRAMEK:-/srv/bramki}"
KOPIE="${KATALOG_KOPII:-/var/backups/psychon}"

zmiana() { ZMIAN=$((ZMIAN + 1)); echo "  ZMIANA: $*"; }
juz()    { echo "  bez zmian: $*"; }
blad()   { BLEDY=$((BLEDY + 1)); echo "  BLAD: $*" >&2; }
naglowek() { echo; echo "=== $* ==="; }

if [ "$(id -u)" -ne 0 ]; then
    echo "Ten skrypt musi dzialac jako root." >&2
    exit 2
fi

w_grupie() {
    # $1 uzytkownik, $2 grupa. Bez apostrofow w wywolaniu - celowo.
    id -nG "$1" 2>/dev/null | tr " " "\n" | grep -qx "$2"
}

# --- 1 - uzytkownicy -------------------------------------------------------
# `deploy` ma sudo i sluzy do wdrozen. `bramka` NIE ma sudo i sluzy wylacznie
# do uruchamiania suit w kontenerach - dlatego jest tylko w grupie `docker`.
# Klucz obu bierzemy z roota: zadnego nowego sekretu nie powolujemy do zycia.
naglowek "1 - uzytkownicy deploy i bramka"

zaloz_uzytkownika() {
    local nazwa="$1" sudoer="$2"
    if id "$nazwa" >/dev/null 2>&1; then
        juz "uzytkownik $nazwa istnieje"
    else
        adduser --disabled-password --gecos "" "$nazwa" >/dev/null 2>&1 \
            && zmiana "uzytkownik $nazwa zalozony" || blad "nie udalo sie zalozyc $nazwa"
    fi

    local dom
    dom="$(getent passwd "$nazwa" | cut -d: -f6)"
    if [ -s "$dom/.ssh/authorized_keys" ]; then
        juz "$nazwa ma juz authorized_keys"
    else
        install -d -m 700 -o "$nazwa" -g "$nazwa" "$dom/.ssh"
        install -m 600 -o "$nazwa" -g "$nazwa" /root/.ssh/authorized_keys "$dom/.ssh/authorized_keys" \
            && zmiana "klucz roota skopiowany do $nazwa" || blad "brak klucza dla $nazwa"
    fi

    if [ "$sudoer" = "tak" ]; then
        if w_grupie "$nazwa" sudo; then
            juz "$nazwa jest w grupie sudo"
        else
            usermod -aG sudo "$nazwa" && zmiana "$nazwa dodany do grupy sudo"
        fi
    else
        # Asercja odwrotna: brak sudo to WYMAGANIE, nie przeoczenie.
        if w_grupie "$nazwa" sudo; then
            blad "$nazwa ma sudo, a miec nie powinien"
        else
            juz "$nazwa nie ma sudo (zgodnie z zalozeniem)"
        fi
    fi
}

zaloz_uzytkownika deploy tak
zaloz_uzytkownika bramka nie

# Samo czlonkostwo w grupie `sudo` NIE WYSTARCZA: konto zalozone
# `--disabled-password` nie ma czym potwierdzic hasla, wiec `sudo` odmawia mu
# tak samo, jak koncie bez uprawnien. Zmierzone na tym hoscie: `sudo -n true`
# dla `deploy` odpowiadalo "a password is required", dopoki nie stanal ten plik.
PLIK_SUDO=/etc/sudoers.d/90-deploy
TRESC_SUDO="deploy ALL=(ALL) NOPASSWD:ALL"
if [ -f "$PLIK_SUDO" ] && [ "$(cat "$PLIK_SUDO")" = "$TRESC_SUDO" ]; then
    juz "deploy ma sudo bez hasla"
else
    printf "%s\n" "$TRESC_SUDO" > "$PLIK_SUDO.nowy"
    chmod 0440 "$PLIK_SUDO.nowy"
    if visudo -cf "$PLIK_SUDO.nowy" >/dev/null 2>&1; then
        mv "$PLIK_SUDO.nowy" "$PLIK_SUDO" && zmiana "deploy: sudo bez hasla"
    else
        rm -f "$PLIK_SUDO.nowy"
        blad "visudo odrzucil plik sudoers; nic nie zmienione"
    fi
fi

# --- 2 - sshd --------------------------------------------------------------
# Root zostaje osiagalny KLUCZEM (awaryjnie), hasla wylaczone calkiem.
# Konfiguracja idzie do osobnego pliku w conf.d, zeby nie przepisywac cudzego
# sshd_config i zeby dalo sie ja usunac jednym `rm`.
naglowek "2 - sshd: hasla wylaczone, root tylko kluczem"

PLIK_SSHD=/etc/ssh/sshd_config.d/60-bootstrap.conf
TRESC_SSHD="PasswordAuthentication no
PermitRootLogin prohibit-password
KbdInteractiveAuthentication no"

if [ -f "$PLIK_SSHD" ] && [ "$(cat "$PLIK_SSHD")" = "$TRESC_SSHD" ]; then
    juz "sshd juz skonfigurowany"
else
    printf "%s\n" "$TRESC_SSHD" > "$PLIK_SSHD"
    # Walidacja PRZED przeladowaniem - zly plik odcialby nas od hosta.
    if sshd -t 2>/dev/null; then
        systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null
        zmiana "sshd: hasla wylaczone, root prohibit-password"
    else
        rm -f "$PLIK_SSHD"
        blad "sshd -t odrzucil konfiguracje; plik cofniety, nic nie przeladowane"
    fi
fi

# --- 3 - zapora, fail2ban, aktualizacje, czas ------------------------------
naglowek "3 - ufw, fail2ban, unattended-upgrades, czas"

export DEBIAN_FRONTEND=noninteractive
for pakiet in ufw fail2ban unattended-upgrades chrony; do
    if dpkg -s "$pakiet" >/dev/null 2>&1; then
        juz "pakiet $pakiet zainstalowany"
    else
        apt-get install -y -qq "$pakiet" >/dev/null 2>&1 \
            && zmiana "pakiet $pakiet zainstalowany" || blad "instalacja $pakiet nie powiodla sie"
    fi
done

# Port 22 MUSI byc przepuszczony przed wlaczeniem ufw - inaczej odcinamy sobie
# wlasna sesje. Kolejnosc jest tu czescia bezpieczenstwa, nie estetyki.
for regula in 22 80 443; do
    if ufw status | grep -q "^$regula/tcp"; then
        juz "ufw: port $regula juz przepuszczony"
    else
        ufw allow "$regula/tcp" >/dev/null && zmiana "ufw: port $regula przepuszczony"
    fi
done
if ufw status verbose | grep -q "deny (incoming)"; then
    juz "ufw: domyslnie deny in"
else
    ufw default deny incoming >/dev/null && zmiana "ufw: domyslnie deny in"
fi
if ufw status | head -1 | grep -q "Status: active"; then
    juz "ufw aktywny"
else
    ufw --force enable >/dev/null && zmiana "ufw wlaczony"
fi

if systemctl is-enabled fail2ban >/dev/null 2>&1 && systemctl is-active fail2ban >/dev/null 2>&1; then
    juz "fail2ban dziala"
else
    systemctl enable --now fail2ban >/dev/null 2>&1 && zmiana "fail2ban wlaczony" || blad "fail2ban nie wstal"
fi

PLIK_AKT=/etc/apt/apt.conf.d/20auto-upgrades
TRESC_AKT="APT::Periodic::Update-Package-Lists \"1\";
APT::Periodic::Unattended-Upgrade \"1\";"
if [ -f "$PLIK_AKT" ] && [ "$(cat "$PLIK_AKT")" = "$TRESC_AKT" ]; then
    juz "unattended-upgrades wlaczone"
else
    printf "%s\n" "$TRESC_AKT" > "$PLIK_AKT" && zmiana "unattended-upgrades wlaczone"
fi

if [ "$(timedatectl show -p Timezone --value)" = "$STREFA" ]; then
    juz "strefa czasowa $STREFA"
else
    timedatectl set-timezone "$STREFA" && zmiana "strefa czasowa ustawiona na $STREFA"
fi

# --- 4 - Docker ------------------------------------------------------------
naglowek "4 - Docker Engine + compose"

if [ -f /etc/apt/keyrings/docker.asc ]; then
    juz "klucz repozytorium Dockera jest"
else
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
        && chmod a+r /etc/apt/keyrings/docker.asc && zmiana "klucz repozytorium Dockera pobrany"
fi

WYDANIE="$(. /etc/os-release && echo "$VERSION_CODENAME")"
ARCH="$(dpkg --print-architecture)"
WPIS="deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $WYDANIE stable"
if [ -f /etc/apt/sources.list.d/docker.list ] && grep -qxF "$WPIS" /etc/apt/sources.list.d/docker.list; then
    juz "repozytorium Dockera dodane"
else
    printf "%s\n" "$WPIS" > /etc/apt/sources.list.d/docker.list
    apt-get update -qq >/dev/null 2>&1
    zmiana "repozytorium Dockera dodane"
fi

PAKIETY_DOCKERA="docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin"
BRAKUJE=""
for pakiet in $PAKIETY_DOCKERA; do
    dpkg -s "$pakiet" >/dev/null 2>&1 || BRAKUJE="$BRAKUJE $pakiet"
done
if [ -n "$BRAKUJE" ]; then
    apt-get install -y -qq $BRAKUJE >/dev/null 2>&1 \
        && zmiana "Docker zainstalowany:$BRAKUJE" || blad "instalacja Dockera nie powiodla sie"
else
    juz "Docker zainstalowany"
fi

# Wersje przypinamy `hold`-em: bez tego nocna aktualizacja zmienia przyrzad
# pomiarowy pod bramkami, a wtedy roznica czasu miedzy biegami nic nie znaczy.
for pakiet in $PAKIETY_DOCKERA; do
    if apt-mark showhold 2>/dev/null | grep -qx "$pakiet"; then
        juz "$pakiet przypiety"
    else
        apt-mark hold "$pakiet" >/dev/null 2>&1 && zmiana "$pakiet przypiety (hold)"
    fi
done

for uzytkownik in deploy bramka; do
    if w_grupie "$uzytkownik" docker; then
        juz "$uzytkownik w grupie docker"
    else
        usermod -aG docker "$uzytkownik" && zmiana "$uzytkownik dodany do grupy docker"
    fi
done

if systemctl is-active docker >/dev/null 2>&1; then
    juz "docker dziala"
else
    systemctl enable --now docker >/dev/null 2>&1 && zmiana "docker wlaczony" || blad "docker nie wstal"
fi

# --- 5 - katalogi ----------------------------------------------------------
naglowek "5 - katalogi stosu i bramek"

zaloz_katalog() {
    local sciezka="$1" wlasciciel="$2"
    if [ -d "$sciezka" ] && [ "$(stat -c %U "$sciezka")" = "$wlasciciel" ]; then
        juz "$sciezka nalezy do $wlasciciel"
    else
        install -d -o "$wlasciciel" -g "$wlasciciel" -m 0755 "$sciezka" \
            && zmiana "$sciezka zalozony dla $wlasciciel"
    fi
}

zaloz_katalog "$KATALOG_STOSU" deploy
zaloz_katalog "$KATALOG_BRAMEK" bramka
for repo in psychon konta strona; do
    zaloz_katalog "$KATALOG_BRAMEK/$repo" bramka
done

# --- 6 - kopie bazy --------------------------------------------------------
# Zadanie wpisujemy juz teraz, ale ma ono MILCZEC, dopoki stosu nie ma.
# Cron, ktory codziennie wypisuje blad, przestaje byc czytany po tygodniu.
naglowek "6 - godzinowa kopia bazy (retencja 7 dni)"

zaloz_katalog "$KOPIE" root
SKRYPT_KOPII=/usr/local/sbin/kopia-psychon.sh
cat > "$SKRYPT_KOPII.nowy" <<"KOPIA"
#!/usr/bin/env bash
# Godzinowy zrzut bazy stosu odbiorczego. Milczy, dopoki stosu nie ma.
set -uo pipefail
KONTENER="$(docker ps --filter name=pgsql --format {{.Names}} | head -1)"
[ -z "$KONTENER" ] && exit 0
KATALOG=/var/backups/psychon
install -d -m 0700 "$KATALOG"
PLIK="$KATALOG/psychon-$(date +%Y%m%d-%H%M).sql.gz"
docker exec "$KONTENER" pg_dumpall -U niepodzielni 2>/dev/null | gzip > "$PLIK" || { rm -f "$PLIK"; exit 1; }
find "$KATALOG" -name "psychon-*.sql.gz" -mtime +7 -delete
KOPIA
if [ -f "$SKRYPT_KOPII" ] && cmp -s "$SKRYPT_KOPII" "$SKRYPT_KOPII.nowy"; then
    rm -f "$SKRYPT_KOPII.nowy"
    juz "skrypt kopii aktualny"
else
    mv "$SKRYPT_KOPII.nowy" "$SKRYPT_KOPII" && chmod 0750 "$SKRYPT_KOPII" && zmiana "skrypt kopii zapisany"
fi

WPIS_CRON="17 * * * * root $SKRYPT_KOPII"
if [ -f /etc/cron.d/psychon-kopie ] && grep -qxF "$WPIS_CRON" /etc/cron.d/psychon-kopie; then
    juz "cron kopii wpisany"
else
    printf "%s\n" "$WPIS_CRON" > /etc/cron.d/psychon-kopie
    chmod 0644 /etc/cron.d/psychon-kopie
    zmiana "cron kopii wpisany"
fi

# --- podsumowanie ----------------------------------------------------------
naglowek "podsumowanie"
echo "ZMIAN=$ZMIAN"
echo "BLEDOW=$BLEDY"
[ "$BLEDY" -eq 0 ] || exit 1
exit 0
