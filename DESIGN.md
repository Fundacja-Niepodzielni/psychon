---
version: alpha
name: Psychon — Niepodzielni
description: Dostępny, spokojny i wspierający system wizualny platformy szkoleniowej Fundacji Niepodzielni.
colors:
  primary: "#00803A"
  primary-hover: "#006B30"
  on-primary: "#FFFFFF"
  brand: "#01BE4A"
  brand-subtle: "#01BE4A1A"
  brand-soft: "#01BE4A33"
  accent: "#594EF9"
  accent-dark: "#1500BB"
  accent-subtle: "#594EF90F"
  accent-container: "#594EF926"
  heading: "#1A1A1A"
  nav-hover: "#1500BB0F"
  nav-hover-ink: "#1500BB"
  nav-active: "#01BE4A1A"
  nav-active-ink: "#006B30"
  row-hover: "#1500BB0F"
  page: "#F9F8F6"
  surface: "#FFFFFF"
  surface-warm: "#F5F4EF"
  surface-muted: "#F5F5F5"
  track: "#E0E0E0"
  border: "#EAEAEA"
  border-warm: "#F9F8F6"
  control: "#858585"
  control-hover: "#555555"
  ink: "#1A1A1A"
  body: "#323232"
  muted: "#555555"
  subtle: "#6B6B6B"
  icon: "#555555"
  success: "#00803A"
  success-container: "#01BE4A1A"
  warning: "#F59E0B"
  warning-ink: "#8A5A00"
  warning-container: "#F59E0B1A"
  danger: "#C0392B"
  danger-container: "#FDF3F3"
  danger-border: "#F5C6CB"
  info: "#4A90E2"
  info-ink: "#2F6CB3"
  info-container: "#4A90E21A"
  event-mentoring: "#E67E22"
  event-supervision: "#4A90E2"
  event-workshop: "#27AE60"
typography:
  title:
    fontFamily: Roboto
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.01em
  subtitle:
    fontFamily: Roboto
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.35
  button:
    fontFamily: Roboto
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.6
  table-label:
    fontFamily: Roboto
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.04em
  h1:
    fontFamily: Roboto
    fontSize: 42px
    fontWeight: 900
    lineHeight: 1.15
    letterSpacing: -0.02em
  h2:
    fontFamily: Roboto
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.01em
  h3:
    fontFamily: Roboto
    fontSize: 26px
    fontWeight: 700
    lineHeight: 1.2
  h4:
    fontFamily: Roboto
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: Roboto
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body-medium:
    fontFamily: Roboto
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.6
  small:
    fontFamily: Roboto
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Roboto
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.5
  caption:
    fontFamily: Roboto
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
rounded:
  xs: 8px
  sm: 12px
  md: 15px
  lg: 20px
  xl: 24px
  "2xl": 28px
  "3xl": 36px
  pill: 50px
  control: 12px
  card: 20px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  "2xl": 24px
  "3xl": 32px
  "4xl": 40px
  "5xl": 48px
  card: 24px
  stack: 24px
  control: 44px
  sidebar: 260px
  panel: 1200px
components:
  app-shell:
    backgroundColor: "{colors.page}"
    textColor: "{colors.body}"
    typography: "{typography.body}"
  heading-primary:
    textColor: "{colors.heading}"
    typography: "{typography.title}"
  heading-card:
    textColor: "{colors.heading}"
    typography: "{typography.subtitle}"
  text-secondary:
    textColor: "{colors.muted}"
    typography: "{typography.small}"
  text-subtle:
    textColor: "{colors.subtle}"
    typography: "{typography.caption}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 8px 24px
    height: 44px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: 8px 24px
    height: 44px
  link-active:
    textColor: "{colors.accent-dark}"
    typography: "{typography.label}"
  button-ghost:
    textColor: "{colors.body}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    height: 44px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: 44px
  input-border:
    backgroundColor: "{colors.control}"
    height: 1px
  navigation-item:
    rounded: "{rounded.control}"
    height: 44px
  navigation-hover:
    backgroundColor: "{colors.nav-hover}"
  navigation-hover-label:
    textColor: "{colors.nav-hover-ink}"
  navigation-active:
    backgroundColor: "{colors.nav-active}"
    rounded: "{rounded.control}"
  navigation-active-label:
    textColor: "{colors.nav-active-ink}"
    typography: "{typography.label}"
  navigation-section-label:
    textColor: "{colors.muted}"
    typography: "{typography.table-label}"
  icon:
    textColor: "{colors.icon}"
    size: 20px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  card-warm:
    backgroundColor: "{colors.surface-warm}"
    textColor: "{colors.body}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  helper-panel:
    backgroundColor: "{colors.accent-subtle}"
    rounded: "{rounded.sm}"
  helper-panel-label:
    textColor: "{colors.body}"
  badge-accent:
    backgroundColor: "{colors.accent-container}"
    rounded: "{rounded.pill}"
  badge-accent-label:
    textColor: "{colors.accent-dark}"
    typography: "{typography.caption}"
  progress-track:
    backgroundColor: "{colors.track}"
    height: 10px
    rounded: "{rounded.pill}"
  progress-fill:
    backgroundColor: "{colors.brand}"
    height: 10px
    rounded: "{rounded.pill}"
  progress-fill-soft:
    backgroundColor: "{colors.brand-soft}"
    height: 10px
    rounded: "{rounded.pill}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  table-divider:
    backgroundColor: "{colors.border}"
    height: 1px
  table-header-label:
    textColor: "{colors.muted}"
    typography: "{typography.table-label}"
  table-row-hover:
    backgroundColor: "{colors.row-hover}"
  status-success:
    backgroundColor: "{colors.success-container}"
    rounded: "{rounded.pill}"
  status-success-label:
    textColor: "{colors.success}"
    typography: "{typography.caption}"
  status-warning:
    backgroundColor: "{colors.warning-container}"
    rounded: "{rounded.pill}"
  status-warning-label:
    textColor: "{colors.warning-ink}"
    typography: "{typography.caption}"
  warning-indicator:
    backgroundColor: "{colors.warning}"
    size: 8px
    rounded: "{rounded.pill}"
  alert-danger:
    backgroundColor: "{colors.danger-container}"
    textColor: "{colors.danger}"
    typography: "{typography.small}"
    rounded: "{rounded.control}"
  alert-danger-border:
    backgroundColor: "{colors.danger-border}"
    height: 1px
  alert-info:
    backgroundColor: "{colors.info-container}"
    rounded: "{rounded.control}"
  alert-info-label:
    textColor: "{colors.info-ink}"
    typography: "{typography.small}"
  info-indicator:
    backgroundColor: "{colors.info}"
    size: 8px
    rounded: "{rounded.pill}"
  event-mentoring-indicator:
    backgroundColor: "{colors.event-mentoring}"
    size: 8px
    rounded: "{rounded.pill}"
  event-supervision-indicator:
    backgroundColor: "{colors.event-supervision}"
    size: 8px
    rounded: "{rounded.pill}"
  event-workshop-indicator:
    backgroundColor: "{colors.event-workshop}"
    size: 8px
    rounded: "{rounded.pill}"
---

## Overview

Psychon ma być spokojnym, wspierającym i wiarygodnym środowiskiem nauki dla psychologów-wolontariuszy. Interfejs łączy ciepłe, prawie papierowe tło z białymi powierzchniami, łagodną geometrią oraz niewielką liczbą mocnych akcentów. Ma przypominać uporządkowany program rozwojowy, a nie korporacyjny panel administracyjny ani kolorową platformę rozrywkową.

Wrażenie wizualne budują: dużo oddechu, czytelna hierarchia, miękkie karty, krótkie komunikaty oraz przyjazne statusy. Zieleń sygnalizuje postęp i działania, natomiast fiolet Fundacji niesie najechanie w menu, pierścień fokusu i znak Fundacji. Tytuły ekranów i kart zostają czarne, zgodnie z decyzją właściciela.

Tokeny w tym pliku odpowiadają semantycznym zmiennym `--psy-*` i klasom Tailwind z `frontend/app/globals.css`. Przy implementacji należy używać istniejących klas semantycznych zamiast wpisywania kolorów i promieni bezpośrednio w komponentach. Tokeny drugiej wersji są rolami (`text-heading`, `border-control`, `bg-nav-active`, `min-h-control`, `p-card`, `gap-stack`, `rounded-control`, `rounded-card`) i każdy ma w `globals.css` numer zasady interfejsu, którą realizuje.

## Colors

- **Primary — ciemna zieleń działania (#00803A):** podstawowe przyciski, aktywne elementy nawigacji oraz dostępny tekst sukcesu. To interaktywna wersja zieleni marki.
- **Brand — żywa zieleń Niepodzielnych (#01BE4A):** postęp, ikony, znaczniki i dekoracyjne akcenty. Nie stosować jako tła pod biały tekst, ponieważ taka para nie osiąga wymaganego kontrastu.
- **Accent — edukacyjny fiolet (#594EF9):** wyróżnienie kursów, materiałów, aktywnego kontekstu i drugorzędnych działań. Ciemniejszy wariant (#1500BB) służy do tekstowych linków wymagających większego kontrastu.
- **Page — ciepła kość słoniowa (#F9F8F6):** główne tło aplikacji; ogranicza kliniczną surowość czystej bieli.
- **Surface — czysta biel (#FFFFFF):** karty, formularze, nagłówki i sidebar. Białe powierzchnie powinny być wyraźnie odseparowane przez subtelny cień lub obramowanie.
- **Surface warm — ciepły beż (#F5F4EF):** pomocnicze sekcje, informacje kontekstowe i spokojne panele drugiego planu.
- **Heading — czerń tekstu (#1A1A1A):** tytuły ekranów i kart; 16,40:1 na tle strony i 17,40:1 na bieli. Fiolet Fundacji nie jest kolorem nagłówków.
- **Control (#858585):** obramowanie pól, przełączników i przycisku wylogowania; 3,48:1 na tle strony i 3,73:1 na bieli (dawne #EAEAEA dawało 1,20:1). Pod kursorem obramowanie ciemnieje do `muted`.
- **Primary hover — głęboka zieleń (#006B30):** tło przycisku głównego pod kursorem (biały tekst 6,68:1) i tekst aktywnej pozycji menu na jasnym zielonym tincie (6,03:1).
- **Nav hover i row hover (#1500BB0F):** delikatny fioletowy tint najechania w menu i w wierszu tabeli; tekst pozycji menu pod kursorem przechodzi w fiolet (10,63:1).
- **Icon (#555555):** kolor ikon liniowych; 7,46:1 na bieli.
- **Ink (#1A1A1A), Body (#323232), Muted (#555555), Subtle (#6B6B6B):** czterostopniowa hierarchia tekstu od treści do opisów i metadanych. Nie rozjaśniać tekstu pomocniczego poniżej wartości `subtle`.
- **Statusy:** sukces korzysta z dostępnej ciemnej zieleni, ostrzeżenie z bursztynu, błąd z przygaszonej czerwieni, a informacja z chłodnego błękitu. Jasne warianty są tłami, nie tekstem.
- **Wydarzenia:** mentoring jest pomarańczowy, superwizja błękitna, a warsztat zielony. Kolor zawsze musi być wsparty etykietą tekstową lub ikoną.

## Typography

Jedyną rodziną kroju jest **Roboto** z bezpiecznym fallbackiem systemowym. Dzięki neutralnym kształtom znaków tekst pozostaje czytelny w formularzach, materiałach szkoleniowych i tabelach. Nagłówki używają wysokiej wagi i zwartej interlinii; tekst ciągły ma swobodną interlinię 1.6 i szerokość najwyżej `max-w-2xl`. Nagłówki `h1`–`h3` łamią się równo (`text-wrap: balance`).

- `title` (30px, pogrubiony, czarny) jest tytułem ekranu w panelu i na ekranie logowania; `subtitle` (18px) jest tytułem karty.
- Przyciski mają wagę 600, bez wersalików.

- `h1` służy wyłącznie jako główny tytuł ekranu. Na wąskich ekranach zmniejsza się do 32px.
- `h2` i `h3` budują sekcje oraz grupy kart. Na mobile mogą zejść odpowiednio do 26px i 22px.
- `h4` jest tytułem pojedynczej karty lub zwartego modułu.
- `body` jest domyślnym tekstem treści, a `body-medium` służy przyciskom i ważniejszym etykietom.
- `small`, `label` i `caption` obsługują opisy, formularze, statusy i metadane. Nie schodzić poniżej 13px.

Nie stosować wersalików w nagłówkach treści. Wersaliki mogą pojawić się wyłącznie w krótkich nagłówkach tabel lub technicznych etykietach, z delikatnie zwiększonym światłem międzyliterowym.

## Layout

Panel na desktopie składa się z bocznej nawigacji o szerokości 260px, nagłówka o wysokości 80px (64px na wąskim ekranie) i centralnej kolumny treści o maksymalnej szerokości 1200px. Bloki ekranu dzieli stały odstęp 24px (`gap-stack`), a wnętrze karty ma 24px (`p-card`). Ekrany niebędące listą korzystają z szablonu `PageTemplate`, listy z `ListTemplate`, a ekrany wejścia z `AuthTemplate` (jedna kolumna `max-w-md` ze znakiem Fundacji).

Układ powinien prowadzić użytkownika pionowo: tytuł i krótkie wyjaśnienie, najważniejsze działanie, status lub postęp, a następnie szczegóły. Tłem wyróżniony jest najwyżej jeden blok ekranu, na jednej z dwóch pierwszych pozycji. Karty w siatce muszą zachowywać równą wysokość, gdy reprezentują elementy tej samej kategorii.

Menu boczne powyżej siedmiu widocznych wpisów dzieli się na sekcje. Nagłówek sekcji jest przyciskiem zwijającym; stan zwinięcia zostaje w przeglądarce pod kluczem `psychon.menu.<panel>`, a sekcja z bieżącą stroną jest zawsze rozwinięta. Krótsze menu zostaje jedną listą.

Na ekranach węższych niż 1024px menu boczne znika, a przycisk „Menu” w nagłówku otwiera wysuwane okno z tymi samymi sekcjami. Menu nie przewija się w poziomie. Wielokolumnowe siatki składają się do jednej kolumny. Minimalny obszar dotykowy elementów interaktywnych wynosi 44px (`min-h-control`), nawet jeśli widoczna ikona jest mniejsza.

Warstwy mają nazwaną skalę: `z-dropdown` → `z-sticky` → `z-backdrop` → `z-modal` → `z-toast` → `z-tooltip`. Liczb `z-index` nie wpisuje się w komponentach.

## Elevation & Depth

System jest płytki i spokojny. Domyślna karta używa szeptanego, rozproszonego cienia `0 4px 20px #0000000D`; nagłówek wykorzystuje jeszcze subtelniejszy cień `0 2px 10px #0000000D`. Ciepłe panele pomocnicze mogą pozostać całkowicie płaskie.

Nie łączyć mocnego cienia, grubego obramowania i intensywnego tła na jednym elemencie. Cień oznacza warstwę i występuje tylko w karcie i w szkielecie panelu. Wysuwane menu dostaje wyraźniejszy cień `0 8px 30px #0000001A` (`shadow-raised`, wartość ze strony Fundacji), nadal bez ciężkiego, czarnego cienia.

## Shapes

Geometria jest miękka i przystępna. Pola formularzy, pozycje menu i komunikaty mają narożniki 12px (`rounded-control`). Karty i tabele używają 20px (`rounded-card`). Przyciski, zakładki, badge, awatary i paski postępu są pigułkowe.

Promienie należy dobierać według hierarchii, nie losowo. Element zagnieżdżony powinien mieć promień równy lub mniejszy od kontenera nadrzędnego.

## Components

- **Przyciski:** podstawowy przycisk ma ciemnozielone tło, biały tekst, kształt pigułki i wysokość co najmniej 44px; pod kursorem tło przechodzi w głęboką zieleń. Wariant drugorzędny jest biały z zielonym obrysem i zielonym tintem pod kursorem, a ghost pozostaje neutralny z fioletowym tintem. W jednej sekcji jest najwyżej jeden przycisk główny. Ikona w przycisku ma 20px, a jej rozmiar ustala sam przycisk. Stan wyłączony to 50% krycia i kursor „niedozwolone”.
- **Karty:** biała karta jest podstawową jednostką treści; używa promienia 20px, dyskretnego obramowania i miękkiego cienia, a jej tytuł jest czarny (`subtitle`). Karta ciepła wyróżnia jeden, najważniejszy blok ekranu.
- **Pola formularzy:** białe, wysokości 44px, z obramowaniem 1px w kolorze `control` i promieniem 12px. Etykieta (waga 600) znajduje się zawsze nad polem. Fokus jest wyraźny i korzysta z fioletowego pierścienia 3px; błąd musi mieć tekst, nie tylko czerwony kolor. Filtry listy stoją we wspólnym pasku `FilterBar`.
- **Nawigacja:** każda pozycja ma ikonę liniową; aktywna pozycja otrzymuje jasny zielony tint, głęboko zielony tekst i pogrubienie. Nagłówki sekcji są małe, szare, z lekko zwiększonym światłem międzyliterowym. Stan aktywny nie może opierać się wyłącznie na cienkiej kresce lub zmianie koloru ikony.
- **Badge i statusy:** zwarte pigułki z krótką etykietą. Barwne tło jest lekkie, a tekst korzysta z ciemniejszego wariantu koloru statusu.
- **Paski postępu:** neutralny szary tor i zielone albo fioletowe wypełnienie. Obok paska należy podać wartość tekstowo, gdy jest ona istotna dla wykonania zadania.
- **Tabele:** nagłówki kolumn są małe, wersalikami z odstępem 0.04em, na szarym tle. Wiersze stosują cienkie separatory (bez pasków na przemian) oraz fioletowy tint na hover. Na wąskim ekranie tabela przewija się w bok i mówi o tym widocznym zdaniem nad nagłówkiem.
- **Komunikaty:** tło w kolorze statusu, ikona statusu po lewej, tytuł pogrubiony, promień 12px.
- **Ikony:** jedna rodzina liniowa, `lucide-react` (licencja ISC), zwykle 20px, w kolorze `icon`. Ikona ma `aria-hidden`, a nazwą dostępną jest etykieta. Ikona wspiera etykietę, ale jej nie zastępuje w kluczowych działaniach. Bez emoji.

Wszystkie interakcje używają krótkiego przejścia (150ms, krzywa `ease-out-quint`) i tylko na stanach: najechanie, fokus, kliknięcie. Przy systemowym ograniczeniu ruchu przejścia i animacje są wyłączone. Fokus klawiatury pozostaje zawsze widoczny. Stany ładowania pokazują szkielet treści z `role="status"`, blokują wielokrotne wysłanie i nie powodują skakania układu.

## Do's and Don'ts

### Do

- Używaj ciepłego tła strony i białych kart, aby zachować spokojną, warstwową strukturę.
- Buduj hierarchię przez rozmiar, wagę i odstępy, zanim sięgniesz po dodatkowy kolor.
- Stosuj ciemną zieleń `primary` dla białego tekstu na przyciskach.
- Łącz każdy kolor statusu z etykietą, ikoną lub opisem.
- Projektuj najpierw czytelny przebieg zadania, a następnie ozdobniki.
- Zachowuj polskie teksty interfejsu i krótkie, wspierające komunikaty.

### Don't

- Nie używaj żywej zieleni `brand` jako tła pod biały tekst.
- Nie wprowadzaj nowych kolorów, fontów, bibliotek ikon (poza `lucide-react`) ani promieni bez uzgodnienia z Fundacją.
- Nie przeładowuj widoku wieloma intensywnymi powierzchniami jednocześnie.
- Nie używaj koloru jako jedynego nośnika statusu, błędu lub postępu.
- Nie zmniejszaj tekstu pomocniczego poniżej 13px ani obszaru dotykowego poniżej 44px.
- Nie kopiuj danych osobowych z makiety do kodu produkcyjnego; używaj wyłącznie danych demonstracyjnych określonych w repozytorium.

## Sources

System został zsyntetyzowany z klikalnej makiety Psychon, zrzutów ekranów organizatora, istniejących tokenów w `frontend/app/globals.css` oraz współdzielonych komponentów z `frontend/components/ui`. Druga wersja bierze wartości (tint najechania, cień warstwy, światło międzyliterowe etykiet) z arkuszy stylów strony niepodzielni.com, a reguły z zasad interfejsu projektu. Makieta jest referencją wizualną, natomiast poprawki dostępności zapisane w kodzie startera są normatywne dla kontrastu tekstu i działań.
