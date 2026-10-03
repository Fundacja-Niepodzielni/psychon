import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { opisRoliOsoby } from "./dane";
import style from "./KartaOsoby.module.css";

interface WlasciwosciRoliKonta {
  /** Rola osoby z karty (`profile.role`). */
  rolaOsoby: string;
}

/**
 * Rola konta na karcie osoby — tylko do odczytu. PsychON bierze rolę z Kont
 * Niepodzielni przy każdym logowaniu osoby, więc karta nie ma pola wyboru ani
 * zapisu roli; mówi tylko, gdzie rolę się zmienia.
 */
export function RolaKonta({ rolaOsoby }: WlasciwosciRoliKonta) {
  return (
    <section className={style.czynnosc} aria-labelledby="czynnosc-rola-naglowek">
      <Heading stopien={2} id="czynnosc-rola-naglowek">
        Rola konta
      </Heading>
      <Text>{opisRoliOsoby(rolaOsoby) ?? "Rola: nieznana"}</Text>
      <Text>Rolę zmienia się w Kontach Niepodzielni.</Text>
    </section>
  );
}
