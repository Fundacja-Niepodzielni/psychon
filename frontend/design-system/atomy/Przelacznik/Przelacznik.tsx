import style from "./Przelacznik.module.css";

interface WlasciwosciPrzelacznika {
  id: string;
  wlaczony: boolean;
  onZmiana: (wartosc: boolean) => void;
  /** Nazwa przełącznika — widoczna etykieta powiązana z kontrolką (`label for`). */
  etykieta: string;
  /** Jedno zdanie pod nazwą; czytnik ekranu czyta je jako opis kontrolki. */
  opis?: string;
  zablokowany?: boolean;
  "data-testid"?: string;
}

/**
 * Przełącznik `Przelacznik` — wł./wył. działające od razu na ekranie:
 * `role="switch"` z `aria-checked`, pole dotyku 44×44 przy widocznym torze
 * 44×24. Stan wybrany jest czytelny bez barwy: znacznik „✓” w kciuku, nie
 * tylko tło toru. Etykieta stoi obok (`label for`), opis w `aria-describedby`.
 * Fokus rysuje wspólna reguła `:focus-visible` (pierścień marki). Tryb tylko do
 * odczytu: `zablokowany` ustawia `disabled`, więc kontrolka wypada z kolejności Tab.
 */
export function Przelacznik({
  id,
  wlaczony,
  onZmiana,
  etykieta,
  opis,
  zablokowany = false,
  "data-testid": testId,
}: WlasciwosciPrzelacznika) {
  const opisId = opis ? `${id}-opis` : undefined;
  return (
    <div className={style.wiersz}>
      <div className={style.tekst}>
        <label htmlFor={id} className={style.nazwa}>
          {etykieta}
        </label>
        {opis ? (
          <span id={opisId} className={style.opis}>
            {opis}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={wlaczony}
        aria-describedby={opisId}
        disabled={zablokowany}
        data-testid={testId}
        className={style.dotyk}
        onClick={() => onZmiana(!wlaczony)}
      >
        <span className={`${style.tor} ${wlaczony ? style.wlaczony : ""}`.trim()} aria-hidden="true">
          <span className={style.kciuk}>{wlaczony ? "✓" : ""}</span>
        </span>
      </button>
    </div>
  );
}
