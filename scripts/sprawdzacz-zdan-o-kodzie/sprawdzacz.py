#!/usr/bin/env python3
r"""Sprawdzacz zdan o kodzie (wersja 2 - kategoria, nie prawda).

Wersja 1 probowala orzekac, czy zdanie o kodzie jest PRAWDZIWE. To jest
nierozstrzygalne w ogolnosci: zeby stwierdzic falsz zdania "X zyje w N
miejscach", trzeba policzyc X w calym drzewie - inny grep dla kazdego
zdania z osobna. Wynik: 0 z 4 znanych falszywych zdan zlapanych na
meritum, a na pliku, z ktorego cala ta kategorie usunieto - falszywe
trafienia. Brak zasiegu i halas naraz.

Ten przyrzad NIE ocenia prawdziwosci. Wykrywa ZAKAZANA KATEGORIE zdan:
takie, ktore LICZA albo WYLICZAJA DRZEWO (kod poza biezacym plikiem) w
prozie (komentarz, README, string-literal uzywany jako czytelny dla
czlowieka powod/opis). Zasada obowiazujaca od tego przyrzadu: naglowek
NIE liczy drzewa; liczby o drzewie zyja w poleceniu (grep/test), nie w
zdaniu prozy obok kodu. Czy takie zdanie jest akurat prawdziwe, jest
nieistotne dla tego przyrzadu - ma go NIE BYC, bo taka liczba starzeje
sie i nic jej nie odswieza.

Wykrywane KSZTALTY (kazdy niezalezny, kazdy ma swoj wlasny falszywy
przypadek w probie odwrotnej - patrz test_sprawdzacz.sh):

  A. LICZBA + RZECZOWNIK-DRZEWA + MARKER WYLACZNOSCI w jednym oknie
     prozy, np. "dokladnie cztery miejsca", "tylko w 3 plikach",
     "wylacznie ... czterech percentyli". Marker wylacznosci
     (dokladnie/wylacznie/tylko/jedynie) jest wymagany - bez niego samo
     "3 pliki" to zwykly opis zakresu zmiany, nie twierdzenie
     wyczerpujace o drzewie.
  B. "jedyn*" + rzeczownik-odniesienia (odwolanie/miejsce/plik/
     wystapienie/wolajacy/komponent/sciezka) BEZ zakresu do biezacego
     pliku ("w tym pliku"/"ten plik"/"tutaj" w poblizu wylacza to
     zdanie - "jedyne miejsce w TYM PLIKU, gdzie..." jest sprawdzalne
     bez grepa w drzewie i nie jest przedmiotem zakazu).
  C. Powszechne zaprzeczenie o wolajacym/uzyciu: "nikt (tego) nie
     wola/wywoluje/uzywa/importuje/uruchamia/wzywa/korzysta", "zaden
     inny ... nie wola/...".
  D. "wszystkie wystapienia/miejsca/odwolania" + wskazanie lokalizacji
     ("sa w", "znajduja sie w", "to:", ": `sciezka`") - samo
     "wszystkie wystapienia FLAGI (moze byc kilka)" bez wskazania
     lokalizacji NIE jest tym ksztaltem (opisuje skladnie, nie drzewo).
  E. "ostatni tak(i/a)/tego typu/rodzaju komponent/plik/modul/miejsce/
     wywolanie" - twierdzenie o pozycji w czasie/przestrzeni drzewa.

Zasieg wejscia (gdzie szukamy prozy):
  * bloki komentarzy wedlug skladni pliku (// , # , /* */, cale .md);
  * DODATKOWO string-literal'y "prozopodobne" (dlugosc >=40 znakow,
    zawieraja spacje i litere polskiego alfabetu) w plikach kodu - bo
    zdanie-swiadek nr 3 (TextLink...) zyje w stalej JS
    (`const POWOD_X = "..."`), nie w komentarzu `//`, a mimo to jest
    dokladnie tym samym zjawiskiem: proza-uzasadnienie obok kodu.
    Moze to zliczyc ten sam fragment dwa razy (blok komentarza i
    string w jego okolicy) - mianownik w POMIAR nizej jest wiec
    PRZYBLIZONY, nie zdeduplikowany co do bajta; nie zaburza to
    wykrywania (kazde unikalne (plik, wiersz) trafienie liczy sie raz).

Tryby dzialania (jak w wersji 1):
  * tryb GIT (domyslny): lista zmienionych plikow to
    `git diff --name-only --diff-filter=ACMR BASE...HEAD`, tresc
    czytana `git show HEAD:plik` (dziala tez na historycznych
    zakresach przez --range, bez checkoutu).
  * tryb PLIKOW (--files): jawna lista plikow na dysku, bez gita.
  * --full-tree REV: skanuje CALE drzewo danej rewizji (nie tylko
    zmiany) - do pomiaru kosztu/zasiegu na czystym drzewie.

Wyjscie: linie `plik:wiersz:powod`, potem jedna linia
`POMIAR: trafienia N / zbadano M komentarzy` (M = liczba jednostek
prozy zbadanych - bloki komentarzy + stringi prozopodobne).

Kody wyjscia - NIGDY 1:
  0 = pomiar sie odbyl (zbadano > 0), zero trafien.
  2 = blad uzycia/wewnetrzny (zly --range, git sie wywalil, brak
      dostepu do pliku w trybie git) ALBO pomiar PUSTY (zbadano == 0 -
      nic nie moglo trafic, wiec "zero" nie jest zaliczeniem, jest
      brakiem pomiaru).
  3 = ZNALEZIONO trafienie zakazanej kategorii (zbadano > 0).
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

# --------------------------------------------------------------------------
# Wzorce jezykowe komentarzy - jak znajdujemy "blok komentarza" w kazdym typie pliku
# --------------------------------------------------------------------------
COMMENT_PREFIXES_BY_EXT = {
    ".sql": ("--",),
    ".sh": ("#",),
    ".bash": ("#",),
    ".py": ("#",),
    ".yml": ("#",),
    ".yaml": ("#",),
    ".php": ("//", "*", "/*", "#"),
    ".js": ("//", "*", "/*"),
    ".ts": ("//", "*", "/*"),
    ".tsx": ("//", "*", "/*"),
    ".jsx": ("//", "*", "/*"),
    ".mjs": ("//", "*", "/*"),
    ".md": None,  # cale pliki .md (README, notatki, ...) licza sie jako proza
}


def wyodrebnij_bloki_komentarzy(ext: str, tresc: str) -> list[tuple[int, str]]:
    """Zwraca liste (numer_pierwszego_wiersza, tekst_bloku) dla plikow kodu.

    Dla .md caly plik to jeden "blok" (proza), bo tam nie ma pojecia komentarza."""
    prefiksy = COMMENT_PREFIXES_BY_EXT.get(ext)
    linie = tresc.splitlines()
    if prefiksy is None:
        return [(1, tresc)]
    obsluguje_gwiazdkowe = "/*" in prefiksy
    bloki: list[tuple[int, str]] = []
    biezacy: list[str] = []
    start = None
    w_bloku_gwiazdkowym = False
    for i, linia in enumerate(linie, start=1):
        s = linia.strip()
        czy_komentarz = s.startswith(prefiksy) or w_bloku_gwiazdkowym
        # Blok /* ... */ dotyczy WYLACZNIE jezykow, ktore go maja w swoich
        # prefiksach - inaczej linia kodu innego jezyka, ktora przypadkiem
        # ZAWIERA tekst "/*" (np. string literal), falszywie otwiera
        # "komentarz" do konca pliku.
        if obsluguje_gwiazdkowe and "/*" in s and not s.strip().startswith("*"):
            w_bloku_gwiazdkowym = True
            czy_komentarz = True
        if czy_komentarz:
            if start is None:
                start = i
            biezacy.append(linia)
            if "*/" in s:
                w_bloku_gwiazdkowym = False
        else:
            if biezacy:
                bloki.append((start, "\n".join(biezacy)))
            biezacy = []
            start = None
    if biezacy:
        bloki.append((start, "\n".join(biezacy)))
    return bloki


# Stringi "prozopodobne": co najmniej 40 znakow, zawieraja spacje i litere
# polskiego alfabetu (odrozniamy prozdozdolna proza-uzasadnienie od zwyklej
# wartosci/identyfikatora typu "gray" albo "user_id"). Nie ograniczamy do
# jednego stylu cudzyslowu - JS/PHP uzywaja '..', ".." i `..` (template).
STRING_LITERAL_RE = re.compile(r"""(['"`])((?:\\.|(?!\1)[\s\S])*)\1""")
POLSKA_LITERA_RE = re.compile(r"[ąćęłńóśźż]", re.IGNORECASE)


def wyodrebnij_stringi_prozopodobne(ext: str, tresc: str) -> list[tuple[int, str]]:
    if ext in (".md",):
        return []
    wyniki: list[tuple[int, str]] = []
    for m in STRING_LITERAL_RE.finditer(tresc):
        zawartosc = m.group(2)
        if len(zawartosc) < 40:
            continue
        if " " not in zawartosc:
            continue
        if not POLSKA_LITERA_RE.search(zawartosc):
            continue
        wiersz = tresc[: m.start()].count("\n") + 1
        wyniki.append((wiersz, zawartosc))
    return wyniki


# --------------------------------------------------------------------------
# Zakazana kategoria: zdania, ktore LICZA albo WYLICZAJA DRZEWO (patrz
# docstring modulu dla listy ksztaltow A-E i uzasadnienia kazdego z nich).
# --------------------------------------------------------------------------
NUM_WORD = (
    r"(?:jeden|jedna|jedno|dwa|dwie|dw[oó]ch|trzy|trzech|cztery|czterech"
    r"|pi[eę][ćc]|pi[eę]ciu|sz[eę][śs][ćc]|sz[eę][śs]ciu|siedem|siedmiu"
    r"|osiem|o[śs]miu|dziewi[eę][ćc]|dziewi[eę]ciu|dziesi[eę][ćc]|dziesi[eę]ciu)"
)
NUM_ANY_RE = re.compile(rf"(?:\d+|{NUM_WORD})", re.IGNORECASE)

TREE_NOUN_RE = re.compile(
    r"(?:miejsc\w*|plik(?:ach|[oó]w|i)\b|wyst[ąa]pie[nń]\w*|odwo[łl]a[nń]\w*"
    r"|komponent\w*|percentyl\w*|modu[łl][oó]w\w*|klas\w*|funkcj\w*"
    r"|[śs]cie[żz]\w*)",
    re.IGNORECASE,
)
EXHAUSTIVE_MARKER_RE = re.compile(r"(?:dok[łl]adnie|wy[łl][aą]cznie|tylko|jedynie)", re.IGNORECASE)
SELF_SCOPE_RE = re.compile(
    r"(?:w\s+tym\s+plik\w*|ten\s+plik\b|tego\s+plik\w*|w\s+tej\s+funkcj\w*"
    r"|w\s+tym\s+bloku|w\s+tym\s+miejscu|\btutaj\b)",
    re.IGNORECASE,
)
DECIMAL_PLACES_RE = re.compile(r"po\s+przecink\w*", re.IGNORECASE)

EXCLUSIVITY_WORD_RE = re.compile(r"\bjedyn\w*\b", re.IGNORECASE)
EXCLUSIVITY_REF_NOUN_RE = re.compile(
    r"(?:odwo[łl]a\w*|miejsc\w*|plik\w*|wyst[ąa]pieni\w*|wo[łl]aj[ąa]c\w*"
    r"|komponent\w*|[śs]cie[żz]k\w*)",
    re.IGNORECASE,
)

CALL_VERB = r"(?:wo[łl]a|wywo[łl]uje|u[żz]ywa|importuje|uruchamia|wzywa|korzysta)"
NEGATIVE_CALLER_RE = re.compile(
    rf"\b(?:nikt|[żz]aden\s+inny\w*)\b[^.\n]{{0,40}}?\bnie\s+{CALL_VERB}",
    re.IGNORECASE,
)

FULL_COVERAGE_RE = re.compile(
    r"\bwszystk\w+\s+(?:wyst[ąa]pieni\w*|miejsc\w*|odwo[łl]a[nń]\w*)\b",
    re.IGNORECASE,
)
LOCATION_HINT_RE = re.compile(
    r"(?:s[ąa]\s+w\b|znajduj\w*\s+si[eę]\s+w\b|\bto\s*[:\-]|:\s*`)",
    re.IGNORECASE,
)

LAST_SUCH_RE = re.compile(
    r"\bostatni\w*\s+(?:tak\w*|tego\s+(?:typu|rodzaju))\s+"
    r"(?:komponent\w*|plik\w*|modu[łl]\w*|miejsc\w*|wywo[łl]ani\w*)",
    re.IGNORECASE,
)


def _okno(tresc: str, start: int, end: int, promien: int) -> str:
    return tresc[max(0, start - promien): min(len(tresc), end + promien)]


@dataclass
class Naruszenie:
    plik: str
    wiersz: int
    powod: str

    def __str__(self) -> str:
        return f"{self.plik}:{self.wiersz}:{self.powod}"


def sprawdz_wyliczanie_drzewa(plik: str, wiersz_startowy: int, tresc: str) -> list[Naruszenie]:
    """Uruchamia wszystkie piec ksztaltow (A-E) na jednej jednostce prozy
    (blok komentarza albo string prozopodobny) i zwraca naruszenia z
    wierszami bezwzglednymi (wiersz_startowy + przesuniecie w tresc)."""
    naruszenia: list[Naruszenie] = []
    zgloszone_wiersze: set[int] = set()

    def _wiersz(pozycja: int) -> int:
        return wiersz_startowy + tresc[:pozycja].count("\n")

    def _dodaj(pozycja: int, opis: str) -> None:
        w = _wiersz(pozycja)
        if w in zgloszone_wiersze:
            return
        zgloszone_wiersze.add(w)
        naruszenia.append(Naruszenie(plik, w, opis))

    # KSZTALT A: liczba + rzeczownik-drzewa + marker wylacznosci w oknie
    for m in TREE_NOUN_RE.finditer(tresc):
        if DECIMAL_PLACES_RE.match(tresc[m.end(): m.end() + 20]):
            continue  # "3 miejsca PO PRZECINKU" - idiom liczbowy, nie drzewo
        okno = _okno(tresc, m.start(), m.end(), 70)
        if SELF_SCOPE_RE.search(okno):
            continue
        if EXHAUSTIVE_MARKER_RE.search(okno) and NUM_ANY_RE.search(okno):
            fragment = " ".join(okno.split())
            _dodaj(m.start(), f"liczy/wylicza drzewo (liczba+rzeczownik+marker wylacznosci): ...{fragment}...")

    # KSZTALT B: "jedyn*" + rzeczownik-odniesienia, bez zakresu do tego pliku
    for m in EXCLUSIVITY_WORD_RE.finditer(tresc):
        okno = _okno(tresc, m.start(), m.end(), 50)
        if SELF_SCOPE_RE.search(okno):
            continue
        if EXCLUSIVITY_REF_NOUN_RE.search(okno):
            fragment = " ".join(okno.split())
            _dodaj(m.start(), f"wylacznosc bez zakresu do tego pliku (jedyn*+odniesienie): ...{fragment}...")

    # KSZTALT C: powszechne zaprzeczenie o wolajacym/uzyciu w calym kodzie
    for m in NEGATIVE_CALLER_RE.finditer(tresc):
        fragment = " ".join(m.group().split())
        _dodaj(m.start(), f"twierdzenie o braku wolajacego w calym kodzie: ...{fragment}...")

    # KSZTALT D: "wszystkie wystapienia/miejsca/odwolania" + lokalizacja
    for m in FULL_COVERAGE_RE.finditer(tresc):
        okno = _okno(tresc, m.start(), m.end(), 90)
        if LOCATION_HINT_RE.search(okno):
            fragment = " ".join(okno.split())
            _dodaj(m.start(), f"twierdzenie o pelnym pokryciu lokalizacji w drzewie: ...{fragment}...")

    # KSZTALT E: "ostatni taki/tego typu X"
    for m in LAST_SUCH_RE.finditer(tresc):
        fragment = " ".join(m.group().split())
        _dodaj(m.start(), f"twierdzenie 'ostatni taki' o elemencie drzewa: ...{fragment}...")

    naruszenia.sort(key=lambda n: n.wiersz)
    return naruszenia


# --------------------------------------------------------------------------
# Zrodlo plikow: GIT albo dysk
# --------------------------------------------------------------------------
class ZrodloPlikow:
    def zmienione(self) -> list[str]:
        raise NotImplementedError

    def tresc(self, sciezka: str) -> str | None:
        raise NotImplementedError


class ZrodloGit(ZrodloPlikow):
    def __init__(self, repo: Path, rev_range: str | None, base: str | None,
                 pelne_drzewo_rev: str | None = None):
        self.repo = repo
        self.pelne_drzewo_rev = pelne_drzewo_rev
        if pelne_drzewo_rev:
            self.head_ref = pelne_drzewo_rev
            self.base_ref = None
            return
        if rev_range:
            if ".." not in rev_range:
                raise SystemExit(f"--range wymaga postaci BAZA..CZUBEK, dostalem: {rev_range!r}")
            base_ref, head_ref = rev_range.split("..", 1)
            self.base_ref = base_ref
            self.head_ref = head_ref
        else:
            self.head_ref = "HEAD"
            self.base_ref = base or self._domyslna_baza()

    def _sh(self, *args: str) -> str:
        r = subprocess.run(
            ["git", "-C", str(self.repo), *args],
            capture_output=True, encoding="utf-8", errors="replace",
        )
        if r.returncode != 0:
            raise SystemExit(f"git {' '.join(args)} -> {r.returncode}: {r.stderr.strip()}")
        return r.stdout

    def _domyslna_baza(self) -> str:
        for kandydat in ("origin/dev", "origin/main", "dev", "main"):
            r = subprocess.run(
                ["git", "-C", str(self.repo), "rev-parse", "--verify", "-q", kandydat],
                capture_output=True, text=True,
            )
            if r.returncode == 0:
                return kandydat
        raise SystemExit("Brak bazy do porownania (--base) i zadna z domyslnych nie istnieje.")

    def merge_base(self) -> str:
        return self._sh("merge-base", self.base_ref, self.head_ref).strip()

    def zmienione(self) -> list[str]:
        if self.pelne_drzewo_rev:
            return sorted(self._drzewo())
        mb = self.merge_base()
        out = self._sh("diff", "--name-only", "--diff-filter=ACMR", f"{mb}", self.head_ref)
        return [l for l in out.splitlines() if l.strip()]

    def _drzewo(self) -> set[str]:
        out = self._sh("ls-tree", "-r", "--name-only", self.head_ref)
        return set(out.splitlines())

    def tresc(self, sciezka: str) -> str | None:
        r = subprocess.run(
            ["git", "-C", str(self.repo), "show", f"{self.head_ref}:{sciezka}"],
            capture_output=True, encoding="utf-8", errors="replace",
        )
        if r.returncode != 0:
            return None
        return r.stdout


class ZrodloPlikowDysk(ZrodloPlikow):
    def __init__(self, pliki: list[str]):
        self._pliki = pliki

    def zmienione(self) -> list[str]:
        return list(self._pliki)

    def tresc(self, sciezka: str) -> str | None:
        p = Path(sciezka)
        if not p.is_file():
            return None
        try:
            return p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None


# --------------------------------------------------------------------------
# GLOWNA PETLA
# --------------------------------------------------------------------------
@dataclass
class WynikPomiaru:
    naruszenia: list[Naruszenie]
    zbadano: int


def uruchom(zrodlo: ZrodloPlikow) -> WynikPomiaru:
    pliki = zrodlo.zmienione()
    naruszenia: list[Naruszenie] = []
    zbadano = 0

    for p in pliki:
        t = zrodlo.tresc(p)
        if t is None:
            continue
        ext = Path(p).suffix.lower()

        for start_wiersz, blok in wyodrebnij_bloki_komentarzy(ext, t):
            zbadano += 1
            naruszenia += sprawdz_wyliczanie_drzewa(p, start_wiersz, blok)

        for wiersz, string_tresc in wyodrebnij_stringi_prozopodobne(ext, t):
            zbadano += 1
            naruszenia += sprawdz_wyliczanie_drzewa(p, wiersz, string_tresc)

    naruszenia.sort(key=lambda n: (n.plik, n.wiersz))
    return WynikPomiaru(naruszenia=naruszenia, zbadano=zbadano)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", default=".", help="korzen repozytorium (tryb git)")
    ap.add_argument("--base", default=None, help="galaz/rewizja bazowa (tryb git)")
    ap.add_argument("--range", default=None, help="jawny zakres BAZA..CZUBEK (tryb git)")
    ap.add_argument("--files", nargs="+", default=None, help="tryb plikow: jawna lista plikow na dysku, bez gita")
    ap.add_argument("--full-tree", default=None, metavar="REV",
                     help="skanuje CALE drzewo danej rewizji (nie tylko zmiany) - pomiar zasiegu/kosztu")
    args = ap.parse_args(argv)

    try:
        if args.files is not None:
            zrodlo: ZrodloPlikow = ZrodloPlikowDysk(args.files)
        elif args.full_tree is not None:
            zrodlo = ZrodloGit(Path(args.repo), None, None, pelne_drzewo_rev=args.full_tree)
        else:
            zrodlo = ZrodloGit(Path(args.repo), args.range, args.base)
        wynik = uruchom(zrodlo)
    except SystemExit as e:
        # Blad uzycia/wewnetrzny (zly --range, git sie wywalil, brak bazy do
        # porownania) - kod=2, NIGDY 1. SystemExit z tresc-argumentem, ktory
        # ucieknie stad NIEZLAPANY, konczy proces kodem 1 (zachowanie
        # Pythona dla SystemExit(str)) - dlatego ta gala LAPIE go tutaj,
        # zamiast pozwolic mu uciec z konstruktora ZrodloGit do gory.
        print(str(e), file=sys.stderr)
        return 2

    for n in wynik.naruszenia:
        print(str(n))

    print(f"POMIAR: trafienia {len(wynik.naruszenia)} / zbadano {wynik.zbadano} komentarzy")

    if wynik.zbadano == 0:
        print("sprawdzacz: pomiar PUSTY - zero jednostek prozy zbadanych, to nie jest zaliczenie", file=sys.stderr)
        return 2
    if wynik.naruszenia:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
