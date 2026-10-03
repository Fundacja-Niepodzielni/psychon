# -*- coding: utf-8 -*-
"""
Makieta wyglądu e-maili PsychON (etap 2 z 4: wygląd).

Jeden zestaw klocków: atomy -> molekuły -> jeden szablon. Każdy e-mail powstaje
wyłącznie z tych klocków. Nowy klocek wolno dodać tylko wtedy, gdy żaden
istniejący nie pasuje; wtedy dołącza do zestawu i trafia na listę NOWE_KLOCKI.

Wejście (tylko odczyt): e-maile-tresci-95bdf9b2.md
Wyjście:
  makiety-emaili.html          strona przeglądu do publikacji (bez doctype/html/head/body)
  podglad-makiety-emaili.html  ta sama treść jako pełny dokument do podglądu lokalnego
  emaile/E-NN.html, E-NN.txt   każdy e-mail jako gotowy dokument i wersja tekstowa

Uruchomienie: python -B buduj.py
"""
import html
import os
import re

KAT = os.path.dirname(os.path.abspath(__file__))
ZRODLO = os.path.join(KAT, "e-maile-tresci-95bdf9b2.md")
KAT_EMAILE = os.path.join(KAT, "emaile")
STRONA = os.path.join(KAT, "makiety-emaili.html")
PODGLAD = os.path.join(KAT, "podglad-makiety-emaili.html")


# =====================================================================
# Wczytanie dokumentu treści (parser przeniesiony z emaile-strona.py)
# =====================================================================

def wczytaj_wpisy(sciezka):
    with open(sciezka, encoding="utf-8") as f:
        linie = f.read().split("\n")
    wpisy, biezacy, w_kodzie, grupa = [], None, False, None
    for l in linie:
        if l.startswith("## E-maile, które platforma wysyła dziś"):
            grupa = "dzis"
        elif l.startswith("## E-maile, których brakuje"):
            grupa = "brak"
        elif l.startswith("## ") and grupa:
            if biezacy:
                wpisy.append(biezacy)
                biezacy = None
            grupa = None
        if not grupa:
            continue
        m = re.match(r"^### (E-\d+)\. (.+)$", l)
        if m:
            if biezacy:
                wpisy.append(biezacy)
            biezacy = {"id": m.group(1), "nazwa": m.group(2), "pola": [], "intro": []}
            continue
        if biezacy is None:
            continue
        if l.strip().startswith("```"):
            if not w_kodzie:
                w_kodzie = True
                biezacy["pola"].append(["__kod__", []])
            else:
                w_kodzie = False
            continue
        if w_kodzie:
            biezacy["pola"][-1][1].append(l)
            continue
        m = re.match(r"^- \*\*(.+?):\*\*\s*(.*)$", l)
        if m:
            biezacy["pola"].append([m.group(1), [m.group(2)]])
            continue
        if re.match(r"^\s{2,}\S", l) and biezacy["pola"] and biezacy["pola"][-1][0] != "__kod__":
            biezacy["pola"][-1][1].append(l.strip())
            continue
        if l.strip():
            biezacy["intro"].append(l.strip())
    if biezacy:
        wpisy.append(biezacy)
    return wpisy


def pola_wpisu(w):
    p = {}
    for nazwa, wart in w["pola"]:
        if nazwa == "__kod__":
            p["__kod__"] = "\n".join(wart).strip("\n")
        else:
            p[nazwa] = " ".join(x for x in wart if x)
    return p


WIELKA = "A-ZĄĆĘŁŃÓŚŹŻ"
RE_WIERSZ = re.compile(r"^([" + WIELKA + r"][^:{}.]{0,58}):\s+(\S.*)$")
RE_ETYKIETA = re.compile(r"^([" + WIELKA + r"][^:{}.]{0,58}):$")
RE_PRZYCISK = re.compile(r"^\[([^\]]+)\](?:\s+\{([^{}]+)\})?$")


def rozbierz_tresc(kod):
    """Treść z bloku ```text -> bloki: akapit, szczegoly, przycisk; plus powód ze stopki."""
    akapity, biezacy = [], []
    for l in kod.split("\n"):
        if l.strip():
            biezacy.append(l.strip())
        elif biezacy:
            akapity.append(biezacy)
            biezacy = []
    if biezacy:
        akapity.append(biezacy)
    bloki, powod, zdanie_wyl, powitanie = [], None, False, False
    for ak in akapity:
        pierwsza = ak[0]
        if pierwsza == "Dzień dobry,":
            powitanie = True
            continue
        if pierwsza.startswith("Wiadomość wysłała platforma PsychON"):
            powod = re.search(r"Dostajesz ją, bo (.+)\.$", pierwsza).group(1)
            zdanie_wyl = any(x.startswith("Wiadomości tego rodzaju możesz wyłączyć") for x in ak[1:])
            continue
        m = RE_PRZYCISK.match(pierwsza)
        if m and len(ak) == 1:
            bloki.append({"typ": "przycisk", "etykieta": m.group(1), "klucz_adresu": m.group(2)})
            continue
        if all(RE_WIERSZ.match(x) for x in ak):
            wiersze = [list(RE_WIERSZ.match(x).groups()) for x in ak]
        elif RE_ETYKIETA.match(pierwsza) and len(ak) > 1:
            wiersze = [[RE_ETYKIETA.match(pierwsza).group(1), "\n".join(ak[1:])]]
        else:
            bloki.append({"typ": "akapit", "tekst": " ".join(ak)})
            continue
        if bloki and bloki[-1]["typ"] == "szczegoly":
            bloki[-1]["wiersze"].extend(wiersze)
        else:
            bloki.append({"typ": "szczegoly", "wiersze": wiersze})
    assert powitanie, "brak powitania"
    assert powod, "brak powodu w stopce"
    return {"bloki": bloki, "powod": powod, "zdanie_wylaczenia": zdanie_wyl}


# =====================================================================
# ATOMY: tokeny (barwy, pismo, odstępy) z jasnego motywu aplikacji
# =====================================================================

def splaszcz(kolor, alfa, tlo):
    """Barwa półprzezroczysta nałożona na tło -> pełna barwa (klienty poczty nie znają alfy)."""
    a = [int(kolor[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(tlo[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join("%02x" % round(y + (x - y) * alfa) for x, y in zip(a, b))


T = {
    "bg": "#f3f1ed",           # --bg
    "card": "#ffffff",         # --card
    "card_warm": "#f5f4ef",    # --card-warm
    "border": "#e6e4df",       # --border
    "ink": "#1a1a1a",          # --ink
    "text": "#323232",         # --text
    "muted": "#5f5d58",        # --muted
    "brand": "#1500bb",        # --brand
    "link": "#594ef9",         # --link
    "primary": "#00803a",      # --primary
    "on_primary": "#ffffff",   # --on-primary
    "warn": "#8a5a00",         # --warn
}
T["brand_tint"] = splaszcz("#1500bb", 0x12 / 255, T["card"])   # --brand-tint na karcie
T["warn_bg"] = splaszcz("#f59e0b", 0x1f / 255, T["card"])      # --warn-bg na karcie

FONT = "Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

# stopnie pisma z tokenów aplikacji (px) i wysokości wiersza (px, 1,55 zaokrąglone)
PISMO = {
    "marka": (20, 20, 900),     # --fs-5, znak Fundacji
    "tresc": (16, 24, 400),     # --fs-8, treść
    "przycisk": (16, 20, 500),  # --fs-8, napis przycisku
    "tytul": (15, 20, 700),     # --fs-9, PsychON w nagłówku, tytuł ramki
    "mala": (13, 20, 400),      # --fs-11, etykiety, stopka, adres pod przyciskiem
}
O = {"s8": 8, "s12": 12, "s16": 16, "s24": 24, "s32": 32}   # --space-*
R = {"xs": 8, "sm": 12, "md": 16, "2xs": 6}                   # --r-*


def st(rodzaj, kolor=None, dodatki=""):
    rozm, wys, waga = PISMO[rodzaj]
    return ("margin:0;font-family:%s;font-size:%dpx;line-height:%dpx;font-weight:%d;color:%s;%s"
            % (FONT, rozm, wys, waga, kolor or T["text"], dodatki))


def luminancja(k):
    def kan(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(k[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * kan(r) + 0.7152 * kan(g) + 0.0722 * kan(b)


def kontrast(a, b):
    la, lb = luminancja(a), luminancja(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def pl(x, miejsca=2):
    return ("%." + str(miejsca) + "f") % x


def plk(x):
    return pl(x).replace(".", ",")


KONTRASTY = [
    ("Treść", T["text"], T["card"], 4.5),
    ("Wartości w liście szczegółów, powitanie", T["ink"], T["card"], 4.5),
    ("Etykiety, stopka, adres pod przyciskiem", T["muted"], T["card"], 4.5),
    ("Napis przycisku na zieleni", T["on_primary"], T["primary"], 4.5),
    ("Przycisk na tle karty (kształt)", T["primary"], T["card"], 3.0),
    ("Odnośnik tekstowy", T["link"], T["card"], 4.5),
    ("Znak Fundacji", T["brand"], T["card"], 4.5),
    ("Treść w ramce „Co dalej”", T["text"], T["brand_tint"], 4.5),
    ("Wartość do uzupełnienia", T["warn"], T["warn_bg"], 4.5),
]


# =====================================================================
# Kontekst: zapisuje, których klocków użył dany e-mail
# =====================================================================

ATOMY = ["barwy", "pismo", "odstępy", "przycisk główny", "odnośnik tekstowy",
         "linia podziału", "wartość do uzupełnienia"]
MOLEKULY = ["nagłówek", "powitanie", "akapit", "lista szczegółów", "ramka „Co dalej”",
            "wiersz przycisku", "stopka"]
NOWE_KLOCKI = []   # klocki dodane ponad zestaw bazowy: (nazwa, dlaczego)


class Kontekst:
    def __init__(self):
        self.klocki = []

    def uzyj(self, nazwa):
        assert nazwa in ATOMY or nazwa in MOLEKULY or nazwa in [n for n, _ in NOWE_KLOCKI], nazwa
        if nazwa not in self.klocki:
            self.klocki.append(nazwa)


def esc(t):
    return html.escape(t, quote=True)


# =====================================================================
# Przykładowe wartości (wymyślone; zgodne z miejscami {…} w treści)
# =====================================================================

BAZA = "https://psychon.example.org"
MIEJSCE_KONTAKT = "[kontakt Fundacji z panelu administracji]"
KLUCZE_KONTAKTU = ("kontakt Fundacji", "sposób kontaktu — do uzupełnienia")

PRZYKLADY = {
    "odnośnik aktywacyjny": BAZA + "/aktywacja?kod=7QK4-M2XP-91LD",
    "powód odrzucenia": "Liczba miejsc w tej edycji programu jest już wyczerpana.",
    "numer zgłoszenia": "POM-000142",
    "treść zgłoszenia": "Nie widzę przycisku zapisu na superwizję, chociaż mam już przydzielonego superwizora.\nProszę o pomoc.",
    "rola — nazwa ze słownika, np. Wolontariusz": "Wolontariusz",
    "ekran": "Superwizja",
    "imię i nazwisko osoby zgłaszającej": "Anna Przykładowa",
    "adres e-mail osoby zgłaszającej": "anna.przykladowa@example.com",
    "tytuł kursu": "Pierwsza pomoc psychologiczna",
    "numer etapu": "2",
    "tytuł etapu": "Rozmowa wspierająca",
    "tytuł lekcji": "Kryzys a zaburzenie",
    "rodzaj dokumentu: porozumienie wolontariackie / zaświadczenie o stażu": "Porozumienie wolontariackie",
    "data": "8 października 2026",
    "godzina": "18:00",
    "data usunięcia": "2 listopada 2026 r.",
    "nazwa dokumentu: Regulamin / Polityka": "Regulamin",
}

ADRESY = {
    "E-08": "/prowadzacy/kursy", "E-09": "/prowadzacy/kursy",
    "E-10": "/panel/kursy/pierwsza-pomoc-psychologiczna",
    "E-11": "/panel/kursy/rozmowa-wspierajaca",
    "E-12": "/prowadzacy/pytania",
    "E-13": "/panel/kursy/pierwsza-pomoc-psychologiczna",
    "E-14": "/panel/staz", "E-15": "/panel/staz", "E-16": "/panel/staz",
    "E-17": "/admin/uczestniczki/1042",
    "E-18": "/panel/certyfikat", "E-19": "/panel/dokumenty",
    "E-20": "/panel/profil-psychologa", "E-21": "/panel/profil-psychologa",
    "E-22": "/admin/profile", "E-23": "/panel/profil", "E-24": "/panel/po-programie",
    "E-25": "/panel/superwizja", "E-26": "/panel/superwizja", "E-27": "/prowadzacy/grupa",
    "E-29": "/panel/profil", "E-30": "/dostep-wygasl", "E-32": "/panel/profil",
    "E-33": "/panel/superwizja", "E-34": "/prowadzacy/grupa",
    "E-35": "/panel/kursy/rozmowa-wspierajaca",
    "E-36": "/panel/certyfikat", "E-37": "/panel/certyfikat",
    "E-38": "/dokumenty-prawne/regulamin",
    "E-39": "/admin/zgloszenia-wspolpracy", "E-41": "/admin/kursy",
}


# =====================================================================
# ATOMY: przycisk główny, odnośnik tekstowy, linia podziału, wartość do uzupełnienia
# Każdy zwraca (html, tekst).
# =====================================================================

def a_przycisk(ctx, etykieta, url):
    ctx.uzyj("przycisk główny")
    rozm, wys, waga = PISMO["przycisk"]
    h = ('<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">'
         '<tr><td align="center" bgcolor="%(p)s" style="border-radius:%(r)dpx;background:%(p)s;">'
         '<a href="%(url)s" target="_blank" style="display:inline-block;padding:12px 24px;'
         'border:1px solid %(p)s;border-radius:%(r)dpx;font-family:%(f)s;font-size:%(rozm)dpx;'
         'line-height:%(wys)dpx;font-weight:%(waga)d;color:%(c)s;text-decoration:none;">%(e)s</a>'
         '</td></tr></table>') % {"p": T["primary"], "r": R["xs"], "url": esc(url), "f": FONT,
                                  "rozm": rozm, "wys": wys, "waga": waga, "c": T["on_primary"],
                                  "e": esc(etykieta)}
    return h, etykieta


def a_odnosnik(ctx, tekst, href):
    ctx.uzyj("odnośnik tekstowy")
    h = '<a href="%s" target="_blank" style="color:%s;text-decoration:underline;">%s</a>' % (
        esc(href), T["link"], esc(tekst))
    return h, tekst


def a_linia(ctx):
    ctx.uzyj("linia podziału")
    h = ('<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0">'
         '<tr><td style="height:1px;line-height:1px;font-size:1px;background:%s;">&nbsp;</td></tr></table>'
         % T["border"])
    return h, "----------"


def a_miejsce(ctx, tekst):
    ctx.uzyj("wartość do uzupełnienia")
    h = ('<span style="padding:1px 6px;border:1px dashed %s;border-radius:%dpx;background:%s;'
         'color:%s;font-weight:500;">%s</span>') % (T["warn"], R["2xs"], T["warn_bg"], T["warn"], esc(tekst))
    return h, tekst


# --- wypełnianie tekstu: {…} -> przykładowa wartość albo atom „wartość do uzupełnienia”

RE_KLUCZ = re.compile(r"\{([^{}]+)\}")


def wypelnij(ctx, tekst):
    h, t, poz = [], [], 0
    for m in RE_KLUCZ.finditer(tekst):
        kawalek = tekst[poz:m.start()]
        h.append(esc(kawalek).replace("\n", "<br>"))
        t.append(kawalek)
        klucz = m.group(1)
        if klucz in KLUCZE_KONTAKTU:
            hh, tt = a_miejsce(ctx, MIEJSCE_KONTAKT)
        elif klucz == "adres e-mail osoby zgłaszającej":
            adres = PRZYKLADY[klucz]
            hh, tt = a_odnosnik(ctx, adres, "mailto:" + adres)
            hh = '<span data-wartosc="">%s</span>' % hh
        elif klucz in PRZYKLADY:
            tt = PRZYKLADY[klucz]
            hh = '<span data-wartosc="">%s</span>' % esc(tt).replace("\n", "<br>")
        else:
            raise KeyError("brak przykładowej wartości dla {%s}" % klucz)
        h.append(hh)
        t.append(tt)
        poz = m.end()
    h.append(esc(tekst[poz:]).replace("\n", "<br>"))
    t.append(tekst[poz:])
    return "".join(h), "".join(t)


# =====================================================================
# MOLEKUŁY: nagłówek, powitanie, akapit, lista szczegółów, ramka „Co dalej”,
# wiersz przycisku, stopka. Każda zwraca (html, tekst).
# =====================================================================

TAB = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'


def m_naglowek(ctx):
    ctx.uzyj("nagłówek")
    linia, _ = a_linia(ctx)
    rozm, wys, waga = PISMO["marka"]
    h = ('<table %s><tr>'
         '<td valign="bottom" style="font-family:%s;font-size:%dpx;line-height:%dpx;font-weight:%d;'
         'letter-spacing:0.01em;color:%s;">FUNDACJA<br>NIEPODZIELNI</td>'
         '<td valign="bottom" align="right" style="%s">PsychON</td>'
         '</tr><tr><td colspan="2" style="padding-top:%dpx;">%s</td></tr></table>') % (
        TAB, FONT, rozm, wys, waga, T["brand"], st("tytul", T["ink"]), O["s16"], linia)
    return h, "Fundacja Niepodzielni · PsychON"


def m_powitanie(ctx):
    ctx.uzyj("powitanie")
    return '<p style="%s">Dzień dobry,</p>' % st("tresc", T["ink"]), "Dzień dobry,"


def m_akapit(ctx, tekst):
    ctx.uzyj("akapit")
    hh, tt = wypelnij(ctx, tekst)
    return '<p style="%s">%s</p>' % (st("tresc"), hh), tt


def m_szczegoly(ctx, wiersze):
    ctx.uzyj("lista szczegółów")
    rz, tx = [], []
    for i, (etykieta, wartosc) in enumerate(wiersze):
        hh, tt = wypelnij(ctx, wartosc)
        gora = "" if i == 0 else "border-top:1px solid %s;" % T["border"]
        rz.append('<tr><td style="padding:%dpx %dpx;%s">'
                  '<p style="%s">%s</p>'
                  '<p style="%s">%s</p></td></tr>' % (
                      O["s12"], O["s16"], gora,
                      st("mala", T["muted"]), esc(etykieta),
                      st("tresc", T["ink"], "overflow-wrap:anywhere;word-break:break-word;"), hh))
        tx.append("%s:\n%s" % (etykieta, tt) if "\n" in tt else "%s: %s" % (etykieta, tt))
    h = ('<table %s style="border:1px solid %s;border-radius:%dpx;border-collapse:separate;">%s</table>'
         % (TAB, T["border"], R["sm"], "".join(rz)))
    return h, "\n".join(tx)


def m_co_dalej(ctx, tekst):
    ctx.uzyj("ramka „Co dalej”")
    hh, tt = wypelnij(ctx, tekst)
    h = ('<table %s style="background:%s;border-radius:%dpx;border-collapse:separate;">'
         '<tr><td bgcolor="%s" style="padding:%dpx;border-radius:%dpx;">'
         '<p style="%s">Co dalej</p><p style="%s">%s</p></td></tr></table>') % (
        TAB, T["brand_tint"], R["sm"], T["brand_tint"], O["s16"], R["sm"],
        st("tytul", T["ink"], "padding-bottom:4px;"), st("tresc"), hh)
    return h, "Co dalej: " + tt


def m_wiersz_przycisku(ctx, etykieta, url):
    ctx.uzyj("wiersz przycisku")
    przycisk, _ = a_przycisk(ctx, etykieta, url)
    h = ('%s<p style="%s">%s</p>' % (
        przycisk, st("mala", T["muted"], "padding-top:%dpx;word-break:break-all;" % O["s8"]), esc(url)))
    return h, "%s: %s" % (etykieta, url)


ZDANIE_WYLACZENIA = ("Wiadomości tego rodzaju możesz wyłączyć w panelu PsychON: Profil → Powiadomienia e-mail. "
                     "Powiadomienie w panelu nadal się pojawi.")


ODBIORCY_STOPKI = ("osoba", "zespol")


def m_stopka(ctx, powod, wylaczalny, odbiorca="osoba"):
    """Jedna stopka, parametr odbiorca: „osoba” (każdy spoza zespołu Fundacji) dostaje linię
    kontaktu z Fundacją; „zespol” (e-maile do samej Fundacji) jej nie dostaje."""
    assert odbiorca in ODBIORCY_STOPKI, odbiorca
    ctx.uzyj("stopka")
    linia, linia_t = a_linia(ctx)
    zdania = [("Wiadomość wysłała platforma PsychON Fundacji Niepodzielni. Dostajesz ją, bo %s." % powod,
               esc("Wiadomość wysłała platforma PsychON Fundacji Niepodzielni. Dostajesz ją, bo %s." % powod))]
    if wylaczalny:
        zdania.append((ZDANIE_WYLACZENIA, esc(ZDANIE_WYLACZENIA)))
    if odbiorca == "osoba":
        kontakt_h, kontakt_t = a_miejsce(ctx, MIEJSCE_KONTAKT)
        zdania.append(("Kontakt z Fundacją: " + kontakt_t, "Kontakt z Fundacją: " + kontakt_h))
    akapity = "".join('<p style="%s">%s</p>' % (
        st("mala", T["muted"], "padding-top:%dpx;" % (O["s16"] if i == 0 else O["s8"])), h)
        for i, (_, h) in enumerate(zdania))
    nazwa = '<p style="%s">Fundacja Niepodzielni</p>' % st("mala", T["ink"], "padding-top:%dpx;font-weight:700;" % O["s12"])
    h = linia + akapity + nazwa
    t = "\n".join([linia_t] + [z for z, _ in zdania] + ["Fundacja Niepodzielni"])
    return h, t


# =====================================================================
# SZABLON (organizm): jedyny układ, którego używa każdy e-mail
#   nagłówek -> powitanie -> treść (akapit / lista szczegółów / ramka „Co dalej”)
#   -> wiersz przycisku (0 albo 1) -> stopka
# =====================================================================

def rzad(zawartosc, gora, dol=0):
    return '<tr><td style="padding:%dpx %dpx %dpx %dpx;">%s</td></tr>' % (gora, O["s24"], dol, O["s24"], zawartosc)


def szablon(e):
    ctx = Kontekst()
    rzedy, tekst = [], []

    def dodaj(para, gora, dol=0):
        rzedy.append(rzad(para[0], gora, dol))
        tekst.append(para[1])

    przyciski = [b for b in e["bloki"] if b["typ"] == "przycisk"]
    assert len(przyciski) <= 1, (e["id"], "najwyżej jeden przycisk")
    if przyciski:
        assert e["bloki"][-1]["typ"] == "przycisk", (e["id"], "przycisk zamyka treść")

    dodaj(m_naglowek(ctx), O["s24"])
    dodaj(m_powitanie(ctx), O["s24"])
    pierwszy_tekst = None
    for b in e["bloki"]:
        if b["typ"] == "akapit":
            para = m_akapit(ctx, b["tekst"])
        elif b["typ"] == "szczegoly":
            para = m_szczegoly(ctx, b["wiersze"])
        elif b["typ"] == "co_dalej":
            para = m_co_dalej(ctx, b["tekst"])
        else:
            continue
        if pierwszy_tekst is None:
            pierwszy_tekst = para[1]
        dodaj(para, O["s16"])
    for b in przyciski:
        dodaj(m_wiersz_przycisku(ctx, b["etykieta"], b["url"]), O["s24"])
    dodaj(m_stopka(ctx, e["powod"], e["wylaczalny"], "zespol" if e["grupa"] == "zespol" else "osoba"),
          O["s32"], O["s24"])

    # ukryty tekst podglądu w skrzynce: pierwsze zdania treści
    podglad = re.sub(r"\s+", " ", pierwszy_tekst or "").strip()
    if len(podglad) > 110:
        podglad = podglad[:110].rsplit(" ", 1)[0] + "…"
    wypelniacz = "&#847;&zwnj;&nbsp;" * 40

    fragment = (
        '<div lang="pl" style="margin:0;padding:0;background:%(bg)s;">'
        '<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;'
        'font-size:1px;line-height:1px;color:%(bg)s;">%(pod)s%(wyp)s</div>'
        '<table %(tab)s style="background:%(bg)s;"><tr><td align="center" bgcolor="%(bg)s" style="padding:%(o24)dpx %(o12)dpx;">'
        '<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->'
        '<table %(tab)s style="max-width:600px;width:100%%;background:%(card)s;border:1px solid %(br)s;'
        'border-radius:%(rmd)dpx;border-collapse:separate;">%(rzedy)s</table>'
        '<!--[if mso]></td></tr></table><![endif]-->'
        '</td></tr></table></div>') % {
        "bg": T["bg"], "pod": esc(podglad), "wyp": wypelniacz, "tab": TAB, "o24": O["s24"], "o12": O["s12"],
        "card": T["card"], "br": T["border"], "rmd": R["md"], "rzedy": "".join(rzedy)}

    dokument = (
        '<!doctype html>\n<html lang="pl">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<meta name="x-apple-disable-message-reformatting">\n'
        '<meta name="color-scheme" content="light">\n<meta name="supported-color-schemes" content="light">\n'
        '<title>%s</title>\n</head>\n<body style="margin:0;padding:0;width:100%%;background:%s;">\n%s\n</body>\n</html>\n'
        % (esc(e["temat_wypelniony"]), T["bg"], re.sub(r'<span data-wartosc="">(.*?)</span>', r"\1", fragment)))

    return {"fragment": fragment, "dokument": dokument, "tekst": "\n\n".join(tekst) + "\n", "klocki": ctx.klocki}


# =====================================================================
# Decyzje właściciela nałożone na treść (każda zmiana opisana w ZMIANY)
# =====================================================================

USUNIETE = {
    "E-06": "Osoba w tej samej chwili dostaje zaproszenie E-01, więc drugi e-mail o tym samym jest zbędny; powiadomienie w panelu zostaje.",
    "E-07": "Osoba, która odrzuciła zgłoszenie, wie o decyzji, bo ją podjęła; wysyłkę do kandydata widać w skrzynce e-maili.",
    "E-28": "Wiadomości czatu powiadamiają tylko dzwonkiem w panelu, nigdy e-mailem.",
}

ZESPOL_DO = "każdy Opiekun Projektu i każdy Super Admin (osobno)."
POWOD_ZESPOL = "masz w PsychON rolę Opiekun Projektu albo Super Admin"
OKNO_POMOCY = ("napisz do Fundacji przez okno „Potrzebujesz pomocy?” w panelu PsychON. "
               "Okno pomocy działa także po zakończeniu dostępu.")

ZMIANY = [
    ("wszystkie", "Stopka ma nazwę Fundacji. E-maile do osób spoza zespołu mają też linię „Kontakt z Fundacją” z wartością z osobnego pola w panelu administracji."),
    ("E-05, E-17, E-22, E-39, E-41", "Bez linii „Kontakt z Fundacją” w stopce, bo te e-maile trafiają do samej Fundacji."),
    ("E-01, E-03", "Instrukcja aktywacji stoi w ramce „Co dalej”; słowa bez zmian."),
    ("E-05", "Kopia dla zespołu podaje imię i nazwisko oraz adres e-mail osoby zgłaszającej."),
    ("E-08", "„Kiedy wychodzi”: nie wychodzi, gdy prowadzący sam zakłada kurs."),
    ("E-12", "„Do kogo”: gdy lekcja ani kurs nie mają prowadzącego, wiadomość dostaje zespół Fundacji (E-41), a nie nikt."),
    ("E-17, E-39, E-41", "Odbiorcy: każdy Opiekun Projektu i każdy Super Admin. W E-17 i E-41 powód w stopce wymienia obie role."),
    ("E-29", "Dopisana ramka „Co dalej”: okno pomocy działa także po zakończeniu dostępu."),
    ("E-30", "Zamiast „sposób kontaktu do uzupełnienia”: okno pomocy i kontakt Fundacji z panelu administracji, w ramce „Co dalej”."),
    ("E-31", "Wychodzi 30 dni przed usunięciem danych; kontakt Fundacji z panelu administracji, w ramce „Co dalej”."),
    ("E-40", "Krótko i bez powodu; kontakt Fundacji z panelu administracji, w ramce „Co dalej”."),
    ("E-06, E-07, E-28", "Usunięte."),
]


def blok_akapit(e, poczatek):
    traf = [b for b in e["bloki"] if b["typ"] == "akapit" and b["tekst"].startswith(poczatek)]
    assert len(traf) == 1, (e["id"], poczatek)
    return traf[0]


def wydziel_co_dalej(e, poczatek_akapitu, poczatek_ramki, nowy_tekst=None):
    b = blok_akapit(e, poczatek_akapitu)
    i = b["tekst"].index(poczatek_ramki)
    reszta = b["tekst"][i:]
    b["tekst"] = b["tekst"][:i].rstrip()
    e["bloki"].insert(e["bloki"].index(b) + 1, {"typ": "co_dalej", "tekst": nowy_tekst or reszta})


def zamien(tekst, stare, nowe):
    assert stare in tekst, stare
    return tekst.replace(stare, nowe)


def zm_aktywacja(e):
    blok_akapit(e, "Otwórz odnośnik poniżej")["typ"] = "co_dalej"


def zm_e05(e):
    lista = next(b for b in e["bloki"] if b["typ"] == "szczegoly")
    i = [w[0] for w in lista["wiersze"]].index("Numer zgłoszenia")
    lista["wiersze"][i + 1:i + 1] = [["Imię i nazwisko", "{imię i nazwisko osoby zgłaszającej}"],
                                     ["Adres e-mail", "{adres e-mail osoby zgłaszającej}"]]


def zm_e08(e):
    e["kiedy"] = ("administracja przypisuje prowadzącego do kursu albo do jednej lekcji kursu. "
                  "Nie wychodzi, gdy prowadzący sam zakłada kurs (platforma przypisuje go wtedy do tego kursu).")


def zm_e12(e):
    e["do"] = zamien(e["do"], "Gdy lekcja nie ma prowadzącego, nikt nie dostaje wiadomości (E-41).",
                     "Gdy lekcja ani jej kurs nie mają prowadzącego, wiadomość dostaje zespół Fundacji (E-41).")


def zm_zespol(e):
    e["do"] = ZESPOL_DO
    if "rolę Opiekun Projektu" in e["powod"]:
        e["powod"] = zamien(e["powod"], "masz w PsychON rolę Opiekun Projektu", POWOD_ZESPOL)


def zm_e29(e):
    b = blok_akapit(e, "za 7 dni")
    e["bloki"].insert(e["bloki"].index(b) + 1,
                      {"typ": "co_dalej", "tekst": "Jeśli potrzebujesz więcej czasu, " + OKNO_POMOCY})


def zm_e30(e):
    wydziel_co_dalej(e, "Twój dostęp", "Jeśli chcesz dokończyć program",
                     "Jeśli chcesz dokończyć program, " + OKNO_POMOCY +
                     " Możesz też skontaktować się z Fundacją: {kontakt Fundacji}.")


def zm_e31(e):
    e["kiedy"] = "30 dni przed anonimizacją konta, które od 12 miesięcy ma wygasły dostęp."
    wydziel_co_dalej(e, "Twoje konto", "Jeśli chcesz zachować konto")


def zm_e40(e):
    wydziel_co_dalej(e, "Twoje konto", "Jeśli masz pytania")


ZMIANY_FUNKCJE = {
    "E-01": zm_aktywacja, "E-03": zm_aktywacja, "E-05": zm_e05, "E-08": zm_e08, "E-12": zm_e12,
    "E-17": zm_zespol, "E-39": zm_zespol, "E-41": zm_zespol,
    "E-29": zm_e29, "E-30": zm_e30, "E-31": zm_e31, "E-40": zm_e40,
}

GRUPY = [
    ("osoba", "Osoba w programie", "Wolontariusze, absolwenci i każda osoba z kontem na platformie."),
    ("prowadzacy", "Prowadzący", "Psycholodzy prowadzący kursy, pytania i grupy superwizyjne."),
    ("zespol", "Zespół Fundacji", "Opiekunowie Projektu, Super Admini i skrzynka zespołu pomocy."),
    ("kandydat", "Kandydat bez konta", "Osoba, która wysłała zgłoszenie do programu i nie ma jeszcze konta."),
]
GRUPA_EMAILA = {"E-02": "kandydat",
                "E-05": "zespol", "E-17": "zespol", "E-22": "zespol", "E-39": "zespol", "E-41": "zespol",
                "E-08": "prowadzacy", "E-09": "prowadzacy", "E-12": "prowadzacy", "E-27": "prowadzacy",
                "E-34": "prowadzacy"}


def czysc_odwolania(s):
    s = re.sub(r"\s*\(pytanie \d+\)", "", s)
    s = re.sub(r"\s*—\s*pytanie \d+", "", s)
    return s.strip()


def stan_wylaczania(s):
    s2 = s.lower()
    if s2.startswith("nie"):
        return "zawsze", "Wychodzi zawsze"
    if "osoba tak" in s2:
        return "osoba", "Osoba może wyłączyć w Profilu"
    return "admin", "Wyłącza tylko administracja"


def zbuduj_emaile(wpisy):
    emaile, uwagi = [], []
    for w in wpisy:
        if w["id"] in USUNIETE:
            continue
        p = pola_wpisu(w)
        tresc = rozbierz_tresc(p["__kod__"])
        e = {"id": w["id"], "nazwa": w["nazwa"], "temat": p["Temat"],
             "kiedy": czysc_odwolania(p["Kiedy wychodzi"]), "do": czysc_odwolania(p["Do kogo"]),
             "wylaczanie": p["Czy można wyłączyć"], "przycisk_opis": p.get("Przycisk", ""),
             "bloki": tresc["bloki"], "powod": tresc["powod"]}
        e["wylaczalny"] = "osoba tak" in e["wylaczanie"].lower()
        if e["wylaczalny"] != tresc["zdanie_wylaczenia"]:
            uwagi.append("%s: pole „Czy można wyłączyć” nie zgadza się ze zdaniem w stopce" % e["id"])
        if e["id"] in ZMIANY_FUNKCJE:
            ZMIANY_FUNKCJE[e["id"]](e)
        for b in e["bloki"]:
            if b["typ"] == "przycisk":
                b["url"] = PRZYKLADY[b["klucz_adresu"]] if b["klucz_adresu"] else BAZA + ADRESY[e["id"]]
        ma_przycisk = any(b["typ"] == "przycisk" for b in e["bloki"])
        if ma_przycisk == e["przycisk_opis"].lower().startswith("brak"):
            uwagi.append("%s: przycisk w treści nie zgadza się z polem „Przycisk”" % e["id"])
        e["grupa"] = GRUPA_EMAILA.get(e["id"], "osoba")
        e["temat_wypelniony"] = wypelnij(Kontekst(), e["temat"])[1]
        e["wynik"] = szablon(e)
        ma_kontakt = "Kontakt z Fundacją: " in e["wynik"]["tekst"]
        if ma_kontakt == (e["grupa"] == "zespol"):
            uwagi.append("%s: linia kontaktu w stopce nie zgadza się z odbiorcą" % e["id"])
        emaile.append(e)
    return emaile, uwagi


# =====================================================================
# Strona przeglądu dla właściciela
# =====================================================================

CSS = r"""
@import url("https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap");
/* Układ: jedna kolumna przeglądu (klocki, potem e-maile w siatce ramek); barwy i pismo z tokenów aplikacji PsychON. */
:root{
  --bg:#f3f1ed;--card:#ffffff;--card-warm:#f5f4ef;--grey:#f1f0ec;--border:#e6e4df;--border-strong:#8a8781;
  --ink:#1a1a1a;--text:#323232;--muted:#5f5d58;--brand:#1500bb;--brand-tint:#1500bb12;--link:#594ef9;
  --invert-bg:#1a1a1a;--invert-ink:#f4f3ef;--warn:#8a5a00;--warn-bg:#f59e0b1f;
  --shadow:0 1px 2px rgba(26,26,26,.08),0 4px 14px rgba(26,26,26,.10);
  /* ramki e-maili zostają jasne w obu motywach: tak e-mail wygląda po wysłaniu */
  --mail-bg:#f3f1ed;--mail-card:#ffffff;--mail-chrome:#fbfaf8;--mail-ink:#1a1a1a;--mail-text:#323232;
  --mail-muted:#5f5d58;--mail-border:#e6e4df;--mail-brand:#1500bb;--mail-brand-tint:#eeedfa;
  --mail-mark:#d9f2e2;--mail-mark-line:#00803a;
  --font:"Roboto",system-ui,-apple-system,"Segoe UI",Arial,sans-serif;
  --mono:ui-monospace,"Cascadia Mono",Consolas,"Liberation Mono",monospace;
  color-scheme:light;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#15151a;--card:#1e1e24;--card-warm:#23232a;--grey:#26262d;--border:#32323b;--border-strong:#6f6f7d;
    --ink:#f4f3ef;--text:#e3e2dc;--muted:#a9a8a1;--brand:#9d92ff;--brand-tint:#9d92ff1f;--link:#a79eff;
    --invert-bg:#f4f3ef;--invert-ink:#15151a;--warn:#f2b84b;--warn-bg:#f59e0b26;
    --shadow:0 1px 2px rgba(0,0,0,.4),0 4px 14px rgba(0,0,0,.5);
    color-scheme:dark;
  }
}
:root[data-theme="dark"]{
  --bg:#15151a;--card:#1e1e24;--card-warm:#23232a;--grey:#26262d;--border:#32323b;--border-strong:#6f6f7d;
  --ink:#f4f3ef;--text:#e3e2dc;--muted:#a9a8a1;--brand:#9d92ff;--brand-tint:#9d92ff1f;--link:#a79eff;
  --invert-bg:#f4f3ef;--invert-ink:#15151a;--warn:#f2b84b;--warn-bg:#f59e0b26;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 4px 14px rgba(0,0,0,.5);
  color-scheme:dark;
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 var(--font);-webkit-font-smoothing:antialiased;overflow-wrap:break-word}
.strona{max-width:1280px;margin-inline:auto;padding-inline:16px;padding-block:32px 72px}
.strona h1,.strona h2,.strona h3,.strona h4{color:var(--ink);margin:0;line-height:1.2;text-wrap:balance;font-weight:700}
.strona a{color:var(--link)}
.strona :focus-visible{outline:3px solid var(--brand);outline-offset:2px;border-radius:6px}
.skip{position:absolute;left:-999px;top:8px;background:var(--card);color:var(--ink);padding:8px 12px;border-radius:8px;border:1px solid var(--border-strong);z-index:10}
.skip:focus{left:8px}

/* nagłówek strony */
.glowa{display:grid;gap:18px;padding-bottom:32px;border-bottom:1px solid var(--border);margin-bottom:40px}
.znak{font-weight:900;font-size:22px;line-height:1;letter-spacing:.01em;color:var(--brand)}
.glowa h1{font-size:clamp(30px,5vw,44px)}
.lead{margin:0;font-size:18px;color:var(--text);max-width:66ch}
.liczby{display:flex;flex-wrap:wrap;gap:10px 28px;margin:0;padding:0;list-style:none}
.liczby li{display:flex;align-items:baseline;gap:6px}
.liczby b{font-size:24px;color:var(--ink);font-variant-numeric:tabular-nums}
.liczby span{font-size:14px;color:var(--muted)}
.uwaga{margin:0;font-size:14px;color:var(--muted);max-width:72ch}
.nawigacja{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.nawigacja a{display:inline-flex;align-items:center;min-height:40px;padding:6px 14px;border-radius:999px;border:1px solid var(--border);background:var(--card);color:var(--ink);text-decoration:none;font-size:14px;font-weight:500}
.nawigacja a:hover{border-color:var(--brand)}

/* sekcje */
.sekcja{margin-bottom:64px}
.sekcja-glowa{display:grid;gap:8px;margin-bottom:24px;max-width:72ch}
.sekcja-glowa h2{font-size:30px}
.sekcja-glowa p{margin:0;color:var(--muted)}
.strona .pod{font-size:20px;margin:40px 0 16px}
.strona .pod:first-of-type{margin-top:0}

/* klocki */
.klocki{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(min(100%,380px),1fr));align-items:start}
.klocki+.klocki{margin-top:16px}
.klocki.dwa{grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))}
.klocek.szeroki{grid-column:1/-1}
.klocek.szeroki .wzor{max-width:640px}
.warianty{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr));align-items:start}
.wariant{display:grid;gap:8px;min-width:0}
.klocek.szeroki .warianty .wzor{max-width:none}
.wariant-etykieta{margin:0;font-size:13px;font-weight:500;color:var(--muted)}
.klocek{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;display:grid;gap:12px;min-width:0}
.klocek-rola{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:500}
.klocek h4{font-size:18px}
.klocek>p{margin:0;font-size:15px;color:var(--muted)}
.wzor{background:var(--mail-card);color:var(--mail-text);border:1px solid var(--mail-border);border-radius:12px;padding:20px;min-width:0;overflow-x:auto}
.wzor-tlo{background:var(--mail-bg)}
.barwy{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.barwy li{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:4px 10px;align-items:center;font-size:14px;color:var(--mail-ink)}
.barwy .probka{width:28px;height:28px;border-radius:8px;border:1px solid var(--mail-border)}
.barwy code{font:12px/1.4 var(--mono);color:var(--mail-muted)}
.barwy small{grid-column:2/-1;font-size:12px;color:var(--mail-muted);margin-top:-4px}
.kontrasty{width:100%;border-collapse:collapse;font-size:14px;color:var(--mail-ink)}
.kontrasty th,.kontrasty td{padding:6px 8px 6px 0;text-align:left;border-top:1px solid var(--mail-border);vertical-align:top}
.kontrasty th{font-weight:500;color:var(--mail-muted);font-size:12px;border-top:0}
.kontrasty td.l{font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.odst{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.odst li{display:grid;grid-template-columns:40px 52px minmax(0,1fr);gap:10px;align-items:center;font-size:14px;color:var(--mail-ink)}
.odst i{display:block;height:12px;background:var(--mail-brand);border-radius:3px}
.odst span{color:var(--mail-muted)}
.pismo-wiersz{display:grid;gap:2px;padding:8px 0;border-top:1px solid var(--mail-border)}
.pismo-wiersz:first-child{border-top:0;padding-top:0}
.pismo-wiersz small{font-size:12px;color:var(--mail-muted)}
.zasady{margin:0;padding-left:20px;display:grid;gap:6px;font-size:15px;color:var(--text)}
.szablon{display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));align-items:start}
.schemat{list-style:none;margin:0;padding:0;display:grid;gap:8px;counter-reset:krok}
.schemat li{counter-increment:krok;display:grid;grid-template-columns:32px minmax(0,1fr);gap:2px 12px;align-items:start;background:var(--mail-card);color:var(--mail-text);border:1px solid var(--mail-border);border-radius:12px;padding:12px 14px}
.schemat li::before{content:counter(krok);grid-row:span 2;width:28px;height:28px;border-radius:50%;background:var(--mail-brand-tint);color:var(--mail-brand);font-weight:700;font-size:14px;display:grid;place-items:center}
.schemat b{color:var(--mail-ink);font-weight:700}
.schemat span{font-size:14px;color:var(--mail-muted)}
.schemat li.wiele{border-style:dashed;border-color:#8a8781}

/* filtry e-maili */
.filtry{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding-block:12px;margin-bottom:8px;border-bottom:1px solid var(--border);background:var(--bg)}
@media (min-width:760px){.filtry{position:sticky;top:env(safe-area-inset-top,0px);z-index:5}}
.filtr{font:inherit;font-size:14px;font-weight:500;min-height:40px;padding:6px 14px;border-radius:999px;border:1px solid var(--border-strong);background:var(--card);color:var(--ink);cursor:pointer;display:inline-flex;gap:8px;align-items:center}
.filtr .ile{font-size:12px;font-variant-numeric:tabular-nums;color:var(--muted)}
.filtr[aria-pressed="true"]{background:var(--invert-bg);color:var(--invert-ink);border-color:var(--invert-bg)}
.filtr[aria-pressed="true"] .ile{color:inherit}
.przel{display:inline-flex;gap:8px;align-items:center;font-size:14px;color:var(--muted);min-height:40px;cursor:pointer;margin-left:auto}
.przel input{width:18px;height:18px;accent-color:var(--brand);margin:0}

/* grupy i ramki e-maili */
.grupa{padding-top:32px}
.grupa-glowa{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;margin-bottom:6px}
.grupa-glowa h3{font-size:24px}
.grupa-glowa .ile{font-size:15px;color:var(--muted);font-variant-numeric:tabular-nums}
.grupa>p{margin:0 0 6px;color:var(--muted);font-size:15px}
.spis{display:flex;flex-wrap:wrap;gap:4px 10px;margin:0 0 20px;padding:0;list-style:none;font-size:14px}
.spis a{font-variant-numeric:tabular-nums}
.siatka{display:grid;gap:40px 24px;grid-template-columns:repeat(auto-fill,minmax(min(100%,540px),1fr));align-items:start}
.mail{display:grid;gap:10px;min-width:0;scroll-margin-top:80px}
.mail-glowa{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}
.mail-glowa .id{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--brand);background:var(--brand-tint);padding:2px 10px;border-radius:999px}
.mail-glowa h4{font-size:18px;flex:1 1 220px;min-width:0}
.chip{display:inline-flex;align-items:center;padding:2px 10px;border-radius:999px;font-size:13px;font-weight:500;background:var(--grey);color:var(--muted)}
.chip.zawsze{background:var(--warn-bg);color:var(--warn)}
.meta{margin:0;display:grid;gap:2px;font-size:14px;color:var(--muted)}
.meta b{color:var(--ink);font-weight:500}
.klient{border:1px solid var(--border-strong);border-radius:14px;overflow:hidden;background:var(--mail-bg);box-shadow:var(--shadow);min-width:0}
.klient-pasek{background:var(--mail-chrome);padding:12px 16px;border-bottom:1px solid var(--mail-border);display:grid;gap:8px}
.klient-temat{font-size:17px;font-weight:700;line-height:1.3;color:var(--mail-ink)}
.klient-od{display:flex;flex-wrap:wrap;align-items:center;gap:2px 8px;font-size:13px;color:var(--mail-muted);min-width:0}
.klient-od .awatar{width:28px;height:28px;border-radius:50%;background:var(--mail-brand-tint);color:var(--mail-brand);font-weight:900;font-size:11px;display:grid;place-items:center;flex:none}
.klient-od b{color:var(--mail-ink);font-weight:500}
.klient-tresc{min-width:0;overflow-x:auto}
.uzyte{margin:0;font-size:13px;color:var(--muted)}
.uzyte b{color:var(--ink);font-weight:500}
details.tekstowa summary{cursor:pointer;min-height:40px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;color:var(--ink);list-style:none}
details.tekstowa summary::-webkit-details-marker{display:none}
details.tekstowa summary::before{content:"";width:7px;height:7px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(-45deg);transition:transform .15s;margin:0 4px 0 2px}
details.tekstowa[open] summary::before{transform:rotate(45deg)}
details.tekstowa pre{margin:4px 0 0;padding:14px 16px;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 var(--mono);color:var(--text);background:var(--card-warm);border:1px solid var(--border);border-radius:12px}
.wartosci [data-wartosc]{background:var(--mail-mark);box-shadow:inset 0 -2px 0 var(--mail-mark-line);border-radius:3px}

/* listy końcowe */
.lista{margin:0;padding:0;list-style:none;display:grid;gap:10px;max-width:80ch}
.lista li{display:grid;grid-template-columns:minmax(88px,max-content) minmax(0,1fr);gap:4px 16px;padding:12px 16px;background:var(--card);border:1px solid var(--border);border-radius:12px}
.lista li b{color:var(--ink);font-variant-numeric:tabular-nums}
.lista li span{color:var(--text)}
.lista li small{grid-column:2;color:var(--muted);font-size:14px}
@media (max-width:480px){.lista li{grid-template-columns:1fr}.lista li small{grid-column:1}}
.pusto{margin:0;padding:16px;border:1px dashed var(--border-strong);border-radius:12px;color:var(--text);max-width:80ch}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
"""

JS = r"""
(function(){
  var przyciski = document.querySelectorAll('[data-filtr]');
  przyciski.forEach(function(b){
    b.addEventListener('click', function(){
      var g = b.getAttribute('data-filtr');
      przyciski.forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); });
      document.querySelectorAll('[data-grupa]').forEach(function(s){
        s.hidden = !(g === 'wszystkie' || s.getAttribute('data-grupa') === g);
      });
    });
  });
  var przel = document.getElementById('pokaz-wartosci');
  if (przel) {
    przel.addEventListener('change', function(){
      document.getElementById('strona').classList.toggle('wartosci', przel.checked);
    });
  }
  document.querySelectorAll('.klient-tresc a, .wzor a').forEach(function(a){
    a.addEventListener('click', function(ev){ ev.preventDefault(); });
    a.setAttribute('title', 'W makiecie odnośniki nie prowadzą dalej');
  });
})();
"""


def wzor(zawartosc, tlo=False):
    return '<div class="wzor%s">%s</div>' % (" wzor-tlo" if tlo else "", zawartosc)


def klocek(rola, nazwa, opis, zawartosc, szeroki=False):
    return ('<article class="klocek%s"><span class="klocek-rola">%s</span><h4>%s</h4><p>%s</p>%s</article>'
            % (" szeroki" if szeroki else "", rola, esc(nazwa), opis, zawartosc))


def tabela_wzoru(zawartosc):
    """Molekuła pokazana tak, jak stoi w karcie e-maila (białe tło, odstęp 24 px)."""
    return wzor('<table %s>%s</table>' % (TAB, zawartosc))


def sekcja_klocki():
    ctx = Kontekst()
    # --- atomy
    barwy = [
        ("Tło e-maila", T["bg"], "wokół karty"),
        ("Karta", T["card"], "tło treści"),
        ("Treść", T["text"], "%s:1 na karcie" % plk(kontrast(T["text"], T["card"]))),
        ("Wartości i powitanie", T["ink"], "%s:1 na karcie" % plk(kontrast(T["ink"], T["card"]))),
        ("Etykiety i stopka", T["muted"], "%s:1 na karcie" % plk(kontrast(T["muted"], T["card"]))),
        ("Znak Fundacji", T["brand"], "%s:1 na karcie" % plk(kontrast(T["brand"], T["card"]))),
        ("Przycisk główny", T["primary"], "biały napis %s:1" % plk(kontrast(T["on_primary"], T["primary"]))),
        ("Odnośnik", T["link"], "%s:1 na karcie" % plk(kontrast(T["link"], T["card"]))),
        ("Ramka „Co dalej”", T["brand_tint"], "treść %s:1" % plk(kontrast(T["text"], T["brand_tint"]))),
        ("Linia podziału", T["border"], "ozdobna, bez wymogu"),
        ("Wartość do uzupełnienia", T["warn_bg"], "napis %s %s:1" % (T["warn"], plk(kontrast(T["warn"], T["warn_bg"])))),
    ]
    barwy_h = '<ul class="barwy">' + "".join(
        '<li><span class="probka" style="background:%s"></span><span>%s</span><code>%s</code><small>%s</small></li>'
        % (k, esc(n), k, esc(o)) for n, k, o in barwy) + "</ul>"
    kontr_h = ('<table class="kontrasty"><thead><tr><th>Para barw</th><th>Kontrast</th><th>Wymóg</th></tr></thead><tbody>'
               + "".join('<tr><td>%s</td><td class="l">%s:1</td><td class="l">%s:1</td></tr>'
                         % (esc(n), plk(kontrast(a, b)), ("%g" % w).replace(".", ",")) for n, a, b, w in KONTRASTY)
               + "</tbody></table>")
    pismo = [
        ("marka", T["brand"], "Znak Fundacji", "FUNDACJA<br>NIEPODZIELNI"),
        ("tresc", T["text"], "Treść", "Twój wpis stażu został zatwierdzony."),
        ("przycisk", T["ink"], "Napis przycisku", "Otwórz dziennik stażu"),
        ("tytul", T["ink"], "Tytuł ramki, PsychON w nagłówku", "Co dalej"),
        ("mala", T["muted"], "Etykiety, stopka, adres pod przyciskiem", "Numer zgłoszenia"),
    ]
    pismo_h = "".join(
        '<div class="pismo-wiersz"><small>%s · %d/%d px · grubość %d</small><p style="%s">%s</p></div>'
        % (esc(n), PISMO[r][0], PISMO[r][1], PISMO[r][2], st(r, k), probka) for r, k, n, probka in pismo)
    pismo_h += '<p style="%s;padding-top:8px">Krój: Roboto jak w aplikacji; gdy go brak, pismo systemowe (San Francisco, Segoe UI, Helvetica, Arial).</p>' % st("mala", T["muted"]).rstrip(";")
    odst = [(8, "adres pod przyciskiem, wiersze stopki"), (12, "wiersze listy szczegółów, margines boczny na telefonie"),
            (16, "między blokami treści, wnętrze ramek"), (24, "wnętrze karty, odstęp nad przyciskiem"),
            (32, "odstęp nad stopką")]
    odst_h = '<ul class="odst">' + "".join(
        '<li><i style="width:%dpx"></i><b>%d px</b><span>%s</span></li>' % (n, n, esc(o)) for n, o in odst) + "</ul>"
    przycisk_h, _ = a_przycisk(ctx, "Otwórz dziennik stażu", BAZA + "/panel/staz")
    odn_h, _ = a_odnosnik(ctx, "anna.przykladowa@example.com", "mailto:anna.przykladowa@example.com")
    linia_h, _ = a_linia(ctx)
    miejsce_h, _ = a_miejsce(ctx, MIEJSCE_KONTAKT)

    atomy = [
        klocek("Atom", "Barwy", "Z jasnego motywu aplikacji. E-mail zawsze wychodzi w jasnej wersji; barwy półprzezroczyste są zamienione na pełne, bo poczta ich nie zna.",
               wzor(barwy_h)),
        klocek("Atom", "Pismo", "Stopnie i grubości z aplikacji. Najmniejszy stopień w e-mailu to 13 px.", wzor(pismo_h)),
        klocek("Atom", "Odstępy", "Ta sama skala co w aplikacji, nic pomiędzy.", wzor(odst_h)),
        klocek("Atom", "Przycisk główny", "Najwyżej jeden w e-mailu. Zielony jak główny przycisk aplikacji, zrobiony z tekstu, bez obrazków.",
               wzor(przycisk_h)),
        klocek("Atom", "Odnośnik tekstowy", "Odnośnik w treści, np. adres e-mail osoby zgłaszającej w kopii dla zespołu.",
               wzor('<p style="%s">Adres: %s</p>' % (st("tresc"), odn_h))),
        klocek("Atom", "Linia podziału", "Oddziela nagłówek i stopkę od treści.", wzor(linia_h)),
        klocek("Atom", "Wartość do uzupełnienia", "Miejsce na dane, których jeszcze nie ma. Kontakt Fundacji przyjdzie z osobnego pola w panelu administracji.",
               wzor('<p style="%s">Kontakt z Fundacją: %s</p>' % (st("mala", T["muted"]), miejsce_h))),
    ]

    # --- molekuły (każda pokazana raz)
    def r(para):
        return '<tr><td>%s</td></tr>' % para[0]

    przyk_szcz = [["Kurs", "{tytuł kursu}"], ["Termin", "{data}, {godzina}"]]
    molekuly = [
        klocek("Molekuła", "Nagłówek", "Znak Fundacji zapisany tekstem, bez plików graficznych, i nazwa platformy. Pod spodem linia podziału.",
               tabela_wzoru(r(m_naglowek(ctx)))),
        klocek("Molekuła", "Powitanie", "„Dzień dobry,” bez imienia, w każdym e-mailu.", tabela_wzoru(r(m_powitanie(ctx)))),
        klocek("Molekuła", "Akapit", "Zwykły tekst wiadomości. Wartości wstawia platforma.",
               tabela_wzoru(r(m_akapit(ctx, "Twoje przypisanie do kursu „{tytuł kursu}” zostało zdjęte.")))),
        klocek("Molekuła", "Lista szczegółów", "Pary etykieta i wartość, gdy treść podaje dane. Etykieta stoi nad wartością, więc długie wartości mieszczą się na telefonie.",
               tabela_wzoru(r(m_szczegoly(ctx, przyk_szcz)))),
        klocek("Molekuła", "Ramka „Co dalej”", "Gdy osoba ma coś zrobić poza kliknięciem przycisku: aktywować dostęp albo skontaktować się z Fundacją.",
               tabela_wzoru(r(m_co_dalej(ctx, "Jeśli masz pytania, skontaktuj się z Fundacją Niepodzielni: {kontakt Fundacji}.")))),
        klocek("Molekuła", "Wiersz przycisku", "Przycisk, a pod nim pełny adres zwykłym tekstem, gdyby przycisk się nie wyświetlił.",
               tabela_wzoru(r(m_wiersz_przycisku(ctx, "Otwórz kursy", BAZA + "/prowadzacy/kursy")))),
        klocek("Molekuła", "Stopka", "Dlaczego osoba dostaje e-mail, zdanie o wyłączaniu (tylko gdy osoba może wyłączyć ten rodzaj) i nazwa Fundacji. "
               "Jedna stopka w dwóch odmianach, zależnie od odbiorcy: e-maile do zespołu Fundacji nie mają linii kontaktu, bo trafiają do samej Fundacji.",
               '<div class="warianty">'
               '<div class="wariant"><p class="wariant-etykieta">Odbiorca: osoba z kontem, prowadzący, kandydat</p>%s</div>'
               '<div class="wariant"><p class="wariant-etykieta">Odbiorca: zespół Fundacji</p>%s</div>'
               '</div>' % (tabela_wzoru(r(m_stopka(ctx, "masz konto na platformie PsychON", True, "osoba"))),
                           tabela_wzoru(r(m_stopka(ctx, POWOD_ZESPOL, False, "zespol")))),
               szeroki=True),
    ]

    schemat = (
        '<ol class="schemat">'
        '<li><b>Nagłówek</b><span>znak Fundacji i PsychON, pod nimi linia podziału</span></li>'
        '<li><b>Powitanie</b><span>„Dzień dobry,”</span></li>'
        '<li class="wiele"><b>Treść</b><span>akapity, lista szczegółów i ramka „Co dalej” w kolejności z treści e-maila</span></li>'
        '<li><b>Wiersz przycisku</b><span>zero albo jeden, zawsze na końcu treści</span></li>'
        '<li><b>Stopka</b><span>powód, wyłączanie gdy dotyczy, kontakt (poza e-mailami do zespołu), nazwa Fundacji</span></li>'
        '</ol>')
    zasady = (
        '<ul class="zasady">'
        '<li>Karta szerokości do 600 px na jasnym tle; na telefonie zwęża się do ekranu i czyta się od 320 px.</li>'
        '<li>Układ z tabel i style zapisane przy każdym elemencie, bo tak czytają je programy pocztowe, także Outlook.</li>'
        '<li>Bez obrazków i skryptów: znak Fundacji i przycisk są zrobione z tekstu.</li>'
        '<li>Najwyżej jeden przycisk; pod nim pełny adres.</li>'
        '<li>Kontakt Fundacji w stopce każdego e-maila spoza zespołu, z osobnego pola w panelu administracji; e-maile do zespołu go nie mają.</li>'
        '<li>Ukryty tekst podglądu w skrzynce to pierwsze zdanie treści, a nie napis z nagłówka.</li>'
        '<li>Każdy e-mail ma też wersję tekstową, złożoną z tych samych klocków.</li>'
        '<li>Kontrast tekstu i przycisku co najmniej 4,5:1 (WCAG AA).</li>'
        '</ul>')
    h = ['<section class="sekcja" id="klocki" aria-labelledby="h-klocki">',
         '<div class="sekcja-glowa"><h2 id="h-klocki">Klocki</h2>'
         '<p>Każdy e-mail składa się wyłącznie z tych klocków. Nowy klocek dochodzi tylko wtedy, gdy żaden istniejący nie pasuje, i od razu trafia do zestawu.</p></div>',
         '<h3 class="pod">Atomy</h3><div class="klocki dwa">%s<article class="klocek"><span class="klocek-rola">Pomiar</span>'
         '<h4>Kontrast według WCAG 2.1</h4><p>Tekst wymaga 4,5:1, kształt przycisku 3:1. Wszystkie pary spełniają poziom AA.</p>%s</article></div>'
         '<div class="klocki">%s</div>' % (atomy[0], wzor(kontr_h), "".join(atomy[1:])),
         '<h3 class="pod">Molekuły</h3><div class="klocki">%s</div>' % "".join(molekuly),
         '<h3 class="pod">Szablon</h3><div class="szablon"><article class="klocek"><span class="klocek-rola">Organizm</span>'
         '<h4>Jeden szablon dla wszystkich e-maili</h4><p>Kolejność klocków jest stała.</p>%s</article>'
         '<article class="klocek"><span class="klocek-rola">Zasady</span><h4>Co szablon zapewnia</h4>%s</article></div>'
         % (schemat, zasady),
         '</section>']
    return "\n".join(h)


def karta_emaila(e):
    w = e["wynik"]
    klasa, stan = stan_wylaczania(e["wylaczanie"])
    do_krotko = re.split(r"(?<=[a-ząćęłńóśźż\)])\. ", e["do"])[0].rstrip(".")
    temat_h = wypelnij(Kontekst(), e["temat"])[0]
    mol = [k for k in MOLEKULY if k in w["klocki"]]
    ato = [k for k in ATOMY if k in w["klocki"]]
    nowe = [k for k in w["klocki"] if k not in MOLEKULY and k not in ATOMY]
    uzyte = "<b>Klocki:</b> %s · <b>atomy:</b> %s" % (" · ".join(mol), " · ".join(ato))
    if nowe:
        uzyte += " · <b>nowe:</b> " + " · ".join(nowe)
    przycisk_opis = e["przycisk_opis"].rstrip(".")
    return (
        '<article class="mail" id="%(idm)s" aria-labelledby="t-%(idm)s">'
        '<div class="mail-glowa"><span class="id">%(id)s</span><h4 id="t-%(idm)s">%(nazwa)s</h4>'
        '<span class="chip %(klasa)s">%(stan)s</span></div>'
        '<p class="meta"><span><b>Kiedy wychodzi:</b> %(kiedy)s</span><span><b>Przycisk:</b> %(przycisk)s</span></p>'
        '<div class="klient"><div class="klient-pasek"><div class="klient-temat">%(temat)s</div>'
        '<div class="klient-od"><span class="awatar" aria-hidden="true">FN</span><b>PsychON · Fundacja Niepodzielni</b>'
        '<span>do: %(do)s</span></div></div>'
        '<div class="klient-tresc">%(fragment)s</div></div>'
        '<p class="uzyte">%(uzyte)s</p>'
        '<details class="tekstowa"><summary>Wersja tekstowa</summary><pre>%(tekst)s</pre></details>'
        '</article>') % {
        "idm": e["id"].lower(), "id": e["id"], "nazwa": esc(e["nazwa"]), "klasa": klasa, "stan": stan,
        "kiedy": esc(e["kiedy"]), "przycisk": esc(przycisk_opis), "temat": temat_h, "do": esc(do_krotko),
        "fragment": w["fragment"], "uzyte": uzyte, "tekst": esc(w["tekst"])}


def sekcja_emaile(emaile):
    licz = {g: sum(1 for e in emaile if e["grupa"] == g) for g, _, _ in GRUPY}
    filtry = ['<button type="button" class="filtr" data-filtr="wszystkie" aria-pressed="true">Wszystkie <span class="ile">%d</span></button>' % len(emaile)]
    for g, nazwa, _ in GRUPY:
        filtry.append('<button type="button" class="filtr" data-filtr="%s" aria-pressed="false">%s <span class="ile">%d</span></button>'
                      % (g, esc(nazwa), licz[g]))
    filtry.append('<label class="przel" for="pokaz-wartosci"><input type="checkbox" id="pokaz-wartosci">'
                  'Zaznacz wartości wstawiane przez platformę</label>')
    h = ['<section class="sekcja" id="emaile" aria-labelledby="h-emaile">',
         '<div class="sekcja-glowa"><h2 id="h-emaile">E-maile</h2>'
         '<p>Każdy e-mail w ramce programu pocztowego: temat, nadawca i treść tak, jak dotrze do skrzynki. '
         'Pod ramką lista użytych klocków i wersja tekstowa.</p></div>',
         '<div class="filtry" role="group" aria-label="Pokaż e-maile do">%s</div>' % "".join(filtry)]
    for g, nazwa, opis in GRUPY:
        grupa = [e for e in emaile if e["grupa"] == g]
        spis = "".join('<li><a href="#%s">%s</a></li>' % (e["id"].lower(), e["id"]) for e in grupa)
        h.append('<div class="grupa" data-grupa="%s"><div class="grupa-glowa"><h3>%s</h3><span class="ile">%d %s</span></div>'
                 '<p>%s</p><ul class="spis" aria-label="Spis: %s">%s</ul><div class="siatka">%s</div></div>'
                 % (g, esc(nazwa), len(grupa), odmiana_emaili(len(grupa)), esc(opis), esc(nazwa), spis,
                    "".join(karta_emaila(e) for e in grupa)))
    h.append("</section>")
    return "\n".join(h)


def odmiana_emaili(n):
    if n == 1:
        return "e-mail"
    if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14):
        return "e-maile"
    return "e-maili"


def sekcja_koncowa(wpisy):
    nazwy = {w["id"]: w["nazwa"] for w in wpisy}
    usun = "".join('<li><b>%s</b><span>%s</span><small>%s</small></li>' % (i, esc(nazwy[i]), esc(p)) for i, p in USUNIETE.items())
    if NOWE_KLOCKI:
        nowe = '<ul class="lista">' + "".join('<li><b>%s</b><span>%s</span></li>' % (esc(n), esc(p)) for n, p in NOWE_KLOCKI) + "</ul>"
    else:
        nowe = ('<p class="pusto">Brak. Wszystkie e-maile złożono z klocków bazowych. Treść zgłoszenia pomocy (E-04, E-05) '
                'mieści się w liście szczegółów jako wartość w kilku wierszach, a adres osoby zgłaszającej to odnośnik tekstowy.</p>')
    zm = "".join('<li><b>%s</b><span>%s</span></li>' % (esc(i), esc(o)) for i, o in ZMIANY)
    return ('<section class="sekcja" id="usuniete" aria-labelledby="h-usuniete"><div class="sekcja-glowa"><h2 id="h-usuniete">Usunięte e-maile</h2>'
            '<p>Tych e-maili platforma nie będzie wysyłać.</p></div><ul class="lista">%s</ul></section>'
            '<section class="sekcja" id="nowe-klocki" aria-labelledby="h-nowe"><div class="sekcja-glowa"><h2 id="h-nowe">Nowe klocki poza zestawem bazowym</h2></div>%s</section>'
            '<section class="sekcja" id="zmiany" aria-labelledby="h-zmiany"><div class="sekcja-glowa"><h2 id="h-zmiany">Zmiany względem zaakceptowanej treści</h2>'
            '<p>Treść e-maili jest zaakceptowana. Poniżej miejsca, w których wygląd lub decyzje zmieniły tekst albo opis.</p></div>'
            '<ul class="lista">%s</ul></section>') % (usun, nowe, zm)


def strona(emaile, wpisy):
    n_atom, n_mol = len(ATOMY), len(MOLEKULY)
    liczby = [(len(emaile), "e-maili do akceptacji"), (len(USUNIETE), "usunięte"), (n_atom, "atomów"),
              (n_mol, "molekuł"), (1, "szablon"), (len(NOWE_KLOCKI), "nowych klocków")]
    glowa = (
        '<header class="glowa">'
        '<div class="znak" aria-hidden="true">FUNDACJA<br>NIEPODZIELNI</div>'
        '<h1>Wygląd e-maili PsychON</h1>'
        '<p class="lead">To wygląd wszystkich e-maili platformy PsychON, złożonych z jednego zestawu klocków: '
        'sprawdź, czy przypominają aplikację, czy dobrze czyta się je na telefonie i czy każdy ma właściwy przycisk i stopkę.</p>'
        '<ul class="liczby">%s</ul>'
        '<p class="uwaga">Nazwy kursów, daty, numery i adresy w e-mailach są przykładowe. Odnośniki w makiecie nie prowadzą dalej.</p>'
        '<ul class="nawigacja" aria-label="Części strony"><li><a href="#klocki">Klocki</a></li><li><a href="#emaile">E-maile</a></li>'
        '<li><a href="#usuniete">Usunięte</a></li><li><a href="#nowe-klocki">Nowe klocki</a></li><li><a href="#zmiany">Zmiany w treści</a></li></ul>'
        '</header>') % "".join('<li><b>%d</b><span>%s</span></li>' % (n, esc(o)) for n, o in liczby)
    tresc = ('<a class="skip" href="#emaile">Przejdź do e-maili</a>\n<div class="strona" id="strona" lang="pl">\n%s\n<main>\n%s\n%s\n%s\n</main>\n</div>'
             % (glowa, sekcja_klocki(), sekcja_emaile(emaile), sekcja_koncowa(wpisy)))
    return tresc


def main():
    wpisy = wczytaj_wpisy(ZRODLO)
    emaile, uwagi = zbuduj_emaile(wpisy)

    tresc = strona(emaile, wpisy)
    publikacja = "<title>Wygląd e-maili PsychON</title>\n<style>%s</style>\n%s\n<script>%s</script>\n" % (CSS, tresc, JS)
    with open(STRONA, "w", encoding="utf-8", newline="\n") as f:
        f.write(publikacja)
    podglad = ('<!doctype html>\n<html lang="pl">\n<head>\n<meta charset="utf-8">\n'
               '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
               '<title>Wygląd e-maili PsychON</title>\n<style>%s</style>\n</head>\n<body>\n%s\n<script>%s</script>\n</body>\n</html>\n'
               % (CSS, tresc, JS))
    with open(PODGLAD, "w", encoding="utf-8", newline="\n") as f:
        f.write(podglad)

    os.makedirs(KAT_EMAILE, exist_ok=True)
    for e in emaile:
        with open(os.path.join(KAT_EMAILE, e["id"] + ".html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(e["wynik"]["dokument"])
        with open(os.path.join(KAT_EMAILE, e["id"] + ".txt"), "w", encoding="utf-8", newline="\n") as f:
            f.write("Temat: %s\n\n%s" % (e["temat_wypelniony"], e["wynik"]["tekst"]))

    # --- podsumowanie na konsolę
    print("wpisy w dokumencie:", len(wpisy))
    print("e-maile:", len(emaile), "usuniete:", len(USUNIETE))
    for g, nazwa, _ in GRUPY:
        print("  grupa %-10s %d" % (g, sum(1 for e in emaile if e["grupa"] == g)))
    print("klocki: atomy %d, molekuly %d, szablon 1, nowe %d" % (len(ATOMY), len(MOLEKULY), len(NOWE_KLOCKI)))
    uzyte = set()
    for e in emaile:
        uzyte.update(e["wynik"]["klocki"])
    print("nieuzyte klocki:", [k for k in ATOMY[3:] + MOLEKULY if k not in uzyte])
    print("kontrast:")
    for n, a, b, w in KONTRASTY:
        print("  %-45s %s on %s = %s (wymog %s) %s" % (n, a, b, pl(kontrast(a, b)), w, "OK" if kontrast(a, b) >= w else "ZA MALO"))
    print("niespojnosci:", uwagi or "brak")
    print("tematy > 60 znakow:", [e["id"] for e in emaile if len(e["temat_wypelniony"]) > 60] or "brak")
    print("rozmiar strony: %d B" % len(publikacja.encode("utf-8")))


if __name__ == "__main__":
    main()
