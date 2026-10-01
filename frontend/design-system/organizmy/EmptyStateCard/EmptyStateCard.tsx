import type { ComponentProps } from "react";
import { EmptyState } from "../../molekuly/EmptyState/EmptyState";
import style from "./EmptyStateCard.module.css";

/**
 * Karta stanu pustego (`EmptyStateCard`): biała karta na całą szerokość
 * obszaru treści, a w środku istniejąca molekuła `EmptyState` — te same
 * właściwości, wszystkie trzy warianty (`pusto`, `brak-wynikow-filtra`,
 * `brak-uprawnien`) i jedyny przycisk. Organizm niczego nie dokłada do treści:
 * tekst, centrowanie i przycisk pochodzą z molekuły, karta daje tylko tło,
 * ramkę, promień i odstęp (makieta: `.empty` wewnątrz `.card`).
 *
 * Szerokość karty to szerokość obszaru, w którym stoi: wołający wstawia ją
 * w obszar na całą szerokość treści (np. `lista` szablonu `ListTemplate`).
 * Znacznik `data-testid="karta-stanu-pustego"` jest jednym, wspólnym
 * uchwytem testów wszystkich ekranów, które używają karty.
 */
export function EmptyStateCard(wlasciwosci: ComponentProps<typeof EmptyState>) {
  return (
    <div className={style.karta} data-testid="karta-stanu-pustego">
      <EmptyState {...wlasciwosci} />
    </div>
  );
}
