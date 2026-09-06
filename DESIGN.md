---
version: alpha
name: Psychon — Niepodzielni
description: Dostępny, spokojny i wspierający system wizualny platformy szkoleniowej Fundacji Niepodzielni.
colors:
  primary: "#00803A"
  on-primary: "#FFFFFF"
  brand: "#01BE4A"
  brand-subtle: "#01BE4A1A"
  brand-soft: "#01BE4A33"
  accent: "#594EF9"
  accent-dark: "#1500BB"
  accent-subtle: "#594EF90F"
  accent-container: "#594EF926"
  page: "#F9F8F6"
  surface: "#FFFFFF"
  surface-warm: "#F5F4EF"
  surface-muted: "#F5F5F5"
  track: "#E0E0E0"
  border: "#EAEAEA"
  border-warm: "#F9F8F6"
  ink: "#1A1A1A"
  body: "#323232"
  muted: "#555555"
  subtle: "#6B6B6B"
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
components:
  app-shell:
    backgroundColor: "{colors.page}"
    textColor: "{colors.body}"
    typography: "{typography.body}"
  heading-primary:
    textColor: "{colors.ink}"
    typography: "{typography.h1}"
  text-secondary:
    textColor: "{colors.muted}"
    typography: "{typography.small}"
  text-subtle:
    textColor: "{colors.subtle}"
    typography: "{typography.caption}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-medium}"
    rounded: "{rounded.pill}"
    padding: 10px 24px
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-medium}"
    rounded: "{rounded.pill}"
    padding: 10px 24px
  link-active:
    textColor: "{colors.accent-dark}"
    typography: "{typography.label}"
  button-ghost:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.body}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
  navigation-active:
    backgroundColor: "{colors.brand-subtle}"
    rounded: "{rounded.sm}"
  navigation-active-label:
    textColor: "{colors.primary}"
    typography: "{typography.label}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.2xl}"
  card-warm:
    backgroundColor: "{colors.surface-warm}"
    textColor: "{colors.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.2xl}"
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
    backgroundColor: "{colors.border-warm}"
    height: 1px
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
    rounded: "{rounded.sm}"
  alert-danger-border:
    backgroundColor: "{colors.danger-border}"
    height: 1px
  alert-info:
    backgroundColor: "{colors.info-container}"
    rounded: "{rounded.sm}"
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

Wrażenie wizualne budują: dużo oddechu, czytelna hierarchia, miękkie karty, krótkie komunikaty oraz przyjazne statusy. Zieleń sygnalizuje postęp i działania, natomiast fiolet prowadzi uwagę do nauki, aktywnego kontekstu i elementów informacyjnych.

Tokeny w tym pliku odpowiadają semantycznym zmiennym `--psy-*` i klasom Tailwind z `frontend/app/globals.css`. Przy implementacji należy używać istniejących klas semantycznych zamiast wpisywania kolorów i promieni bezpośrednio w komponentach.

## Colors

- **Primary — ciemna zieleń działania (#00803A):** podstawowe przyciski, aktywne elementy nawigacji oraz dostępny tekst sukcesu. To interaktywna wersja zieleni marki.
- **Brand — żywa zieleń Niepodzielnych (#01BE4A):** postęp, ikony, znaczniki i dekoracyjne akcenty. Nie stosować jako tła pod biały tekst, ponieważ taka para nie osiąga wymaganego kontrastu.
- **Accent — edukacyjny fiolet (#594EF9):** wyróżnienie kursów, materiałów, aktywnego kontekstu i drugorzędnych działań. Ciemniejszy wariant (#1500BB) służy do tekstowych linków wymagających większego kontrastu.
- **Page — ciepła kość słoniowa (#F9F8F6):** główne tło aplikacji; ogranicza kliniczną surowość czystej bieli.
- **Surface — czysta biel (#FFFFFF):** karty, formularze, nagłówki i sidebar. Białe powierzchnie powinny być wyraźnie odseparowane przez subtelny cień lub obramowanie.
- **Surface warm — ciepły beż (#F5F4EF):** pomocnicze sekcje, informacje kontekstowe i spokojne panele drugiego planu.
- **Ink (#1A1A1A), Body (#323232), Muted (#555555), Subtle (#6B6B6B):** czterostopniowa hierarchia tekstu od nagłówków do opisów i metadanych. Nie rozjaśniać tekstu pomocniczego poniżej wartości `subtle`.
- **Statusy:** sukces korzysta z dostępnej ciemnej zieleni, ostrzeżenie z bursztynu, błąd z przygaszonej czerwieni, a informacja z chłodnego błękitu. Jasne warianty są tłami, nie tekstem.
- **Wydarzenia:** mentoring jest pomarańczowy, superwizja błękitna, a warsztat zielony. Kolor zawsze musi być wsparty etykietą tekstową lub ikoną.

## Typography

Jedyną rodziną kroju jest **Roboto** z bezpiecznym fallbackiem systemowym. Dzięki neutralnym kształtom znaków tekst pozostaje czytelny w formularzach, materiałach szkoleniowych i tabelach. Nagłówki używają wysokiej wagi i zwartej interlinii; tekst ciągły ma swobodną interlinię 1.6.

- `h1` służy wyłącznie jako główny tytuł ekranu. Na wąskich ekranach zmniejsza się do 32px.
- `h2` i `h3` budują sekcje oraz grupy kart. Na mobile mogą zejść odpowiednio do 26px i 22px.
- `h4` jest tytułem pojedynczej karty lub zwartego modułu.
- `body` jest domyślnym tekstem treści, a `body-medium` służy przyciskom i ważniejszym etykietom.
- `small`, `label` i `caption` obsługują opisy, formularze, statusy i metadane. Nie schodzić poniżej 13px.

Nie stosować wersalików w nagłówkach treści. Wersaliki mogą pojawić się wyłącznie w krótkich nagłówkach tabel lub technicznych etykietach, z delikatnie zwiększonym światłem międzyliterowym.

## Layout

Panel na desktopie składa się z bocznej nawigacji o szerokości 260px, nagłówka o wysokości 80px i centralnej kolumny treści o maksymalnej szerokości 1200px. Główna treść otrzymuje co najmniej 24px oddechu od krawędzi, a większe sekcje rozdziela rytm 32–48px.

Układ powinien prowadzić użytkownika pionowo: tytuł i krótkie wyjaśnienie, najważniejsze działanie, status lub postęp, a następnie szczegóły. Karty w siatce muszą zachowywać równą wysokość, gdy reprezentują elementy tej samej kategorii.

Na mniejszych ekranach sidebar przechodzi nad treść, a menu może przewijać się poziomo. Wielokolumnowe siatki składają się do jednej kolumny. Minimalny obszar dotykowy elementów interaktywnych wynosi 44px, nawet jeśli widoczna ikona jest mniejsza.

## Elevation & Depth

System jest płytki i spokojny. Domyślna karta używa szeptanego, rozproszonego cienia `0 4px 20px #0000000D`; nagłówek wykorzystuje jeszcze subtelniejszy cień `0 2px 10px #0000000D`. Ciepłe panele pomocnicze mogą pozostać całkowicie płaskie.

Nie łączyć mocnego cienia, grubego obramowania i intensywnego tła na jednym elemencie. Modal lub element unoszący się może otrzymać wyraźniejszą separację, lecz nadal bez ciężkiego, czarnego cienia.

## Shapes

Geometria jest miękka i przystępna. Pola formularzy oraz elementy nawigacji mają subtelnie zaokrąglone narożniki 12px. Standardowe karty używają 20px, a duże karty wyróżnione mogą używać 28px. Przyciski, badge, awatary i paski postępu są pigułkowe.

Promienie należy dobierać według hierarchii, nie losowo. Element zagnieżdżony powinien mieć promień równy lub mniejszy od kontenera nadrzędnego.

## Components

- **Przyciski:** podstawowy przycisk ma ciemnozielone tło, biały tekst i kształt pigułki. Przycisk fioletowy jest zarezerwowany dla wyróżnionych działań związanych z materiałem lub nauką. Wariant drugorzędny jest biały z zielonym obrysem, a ghost pozostaje neutralny.
- **Karty:** biała karta jest podstawową jednostką treści; używa promienia 20px, dyskretnego obramowania i miękkiego cienia. Karta ciepła jest płaska i służy informacjom pomocniczym. Duże wezwania lub materiały wprowadzające mogą użyć intensywnego fioletowego tła.
- **Pola formularzy:** białe, z obramowaniem 1px i promieniem 12px. Etykieta znajduje się zawsze nad polem. Fokus jest wyraźny i korzysta z pierścienia 3px; błąd musi mieć tekst, nie tylko czerwony kolor.
- **Nawigacja:** aktywna pozycja otrzymuje jasny zielony tint i ciemnozielony tekst. Stan aktywny nie może opierać się wyłącznie na cienkiej kresce lub zmianie koloru ikony.
- **Badge i statusy:** zwarte pigułki z krótką etykietą. Barwne tło jest lekkie, a tekst korzysta z ciemniejszego wariantu koloru statusu.
- **Paski postępu:** neutralny szary tor i zielone albo fioletowe wypełnienie. Obok paska należy podać wartość tekstowo, gdy jest ona istotna dla wykonania zadania.
- **Tabele:** nagłówki są małe, spokojne i wyraźnie oddzielone. Wiersze stosują cienkie separatory oraz delikatne podświetlenie na hover. Na mobile tabela musi umożliwiać przewijanie poziome albo zmienić się w listę kart.
- **Ikony:** liniowe, proste, zwykle 16–24px. Ikona wspiera etykietę, ale jej nie zastępuje w kluczowych działaniach.

Wszystkie interakcje używają krótkiego, łagodnego przejścia. Fokus klawiatury pozostaje zawsze widoczny. Stany ładowania blokują wielokrotne wysłanie i nie powodują skakania układu.

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
- Nie wprowadzaj nowych kolorów, fontów, bibliotek ikon ani promieni bez uzgodnienia z zespołem.
- Nie przeładowuj widoku wieloma intensywnymi powierzchniami jednocześnie.
- Nie używaj koloru jako jedynego nośnika statusu, błędu lub postępu.
- Nie zmniejszaj tekstu pomocniczego poniżej 13px ani obszaru dotykowego poniżej 44px.
- Nie kopiuj danych osobowych z makiety do kodu produkcyjnego; używaj wyłącznie danych demonstracyjnych określonych w repozytorium.

## Sources

System został zsyntetyzowany z klikalnej makiety Psychon, zrzutów ekranów organizatora, istniejących tokenów w `frontend/app/globals.css` oraz współdzielonych komponentów z `frontend/components/ui`. Makieta jest referencją wizualną, natomiast poprawki dostępności zapisane w kodzie startera są normatywne dla kontrastu tekstu i działań.
