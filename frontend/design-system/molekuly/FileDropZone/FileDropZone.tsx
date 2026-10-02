import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { Text } from "../../atomy/Text/Text";
import { Hint } from "../../atomy/Hint/Hint";
import { FileRow } from "../FileRow/FileRow";
import style from "./FileDropZone.module.css";

export interface PlikFileDropZone {
  nazwa: string;
  stan: "przetwarzanie" | "gotowy" | "blad";
  komunikat: string;
}

interface WlasciwosciFileDropZone {
  id: string;
  /** Zdanie mówiące, co wolno upuścić — treść `Text` w obszarze. */
  etykieta: string;
  podpowiedz: string;
  /** Lista już dodanych plików — po dodaniu obszar pokazuje nazwę pliku (KO-3). */
  pliki: PlikFileDropZone[];
  onWybierzPliki: (pliki: FileList) => void;
  /**
   * Czy wolno wybrać albo upuścić kilka plików naraz. Domyślnie `true`.
   * Przy `false` pole wyboru nie ma atrybutu `multiple`, a upuszczenie więcej
   * niż jednego pliku NIE wywołuje `onWybierzPliki` — obszar pokazuje wtedy
   * zdanie „Upuść jeden plik.” (`role="status"`).
   */
  wiele?: boolean;
  /**
   * Wartość atrybutu `accept` pola wyboru (np. `"image/*"`) — podpowiedź dla
   * okna systemu. Komponent NIE filtruje upuszczonych plików: kontrola typu
   * należy do ekranu i serwera.
   */
  akceptuj?: string;
}

/** Kopia listy plików, która zostaje nienaruszona po wyzerowaniu pola wyboru. */
function skopiujListe(pliki: FileList): FileList {
  if (typeof DataTransfer === "undefined") {
    return pliki;
  }
  const kopia = new DataTransfer();
  for (const plik of Array.from(pliki)) {
    kopia.items.add(plik);
  }
  return kopia.files;
}

/**
 * Obszar upuszczania `FileDropZone` (M5). Przyjmuje upuszczenie MYSZĄ i
 * działa z samej KLAWIATURY (Enter, spacja otwierają wybór pliku systemowy)
 * — Odbiór M5. Stan „plik nad obszarem” dostaje osobną ramkę i tło, nie tylko
 * zmienioną barwę tekstu, żeby reakcja była widoczna, nie tylko odczytywalna.
 *
 * Jedynym elementem obsługi jest przycisk obszaru (`{id}-obszar`). Ukryte pole
 * wyboru pliku (`{id}`) stoi obok przycisku, nie w nim, nie jest przystankiem
 * tabulatora i nie jest ogłaszane — służy wyłącznie do otwarcia okna systemu.
 * Po każdym odczycie pole jest zerowane, więc ten sam plik wybrany drugi raz z
 * rzędu wywołuje `onWybierzPliki` ponownie (przeglądarka nie zgłasza zmiany,
 * gdy wartość pola się nie zmieniła).
 */
export function FileDropZone({
  id,
  etykieta,
  podpowiedz,
  pliki,
  onWybierzPliki,
  wiele = true,
  akceptuj,
}: WlasciwosciFileDropZone) {
  const [nadObszarem, setNadObszarem] = useState(false);
  const [komunikat, setKomunikat] = useState("");
  const wejscie = useRef<HTMLInputElement>(null);
  const podpowiedzId = `${id}-podpowiedz`;

  function otworzWybor() {
    wejscie.current?.click();
  }

  function naKlawisz(zdarzenie: KeyboardEvent<HTMLDivElement>) {
    if (zdarzenie.key === "Enter" || zdarzenie.key === " ") {
      zdarzenie.preventDefault();
      otworzWybor();
    }
  }

  function przyjmij(wybrane: FileList) {
    if (wybrane.length === 0) {
      return;
    }
    if (!wiele && wybrane.length > 1) {
      setKomunikat("Upuść jeden plik.");
      return;
    }
    setKomunikat("");
    onWybierzPliki(wybrane);
  }

  function naUpuszczenie(zdarzenie: DragEvent<HTMLDivElement>) {
    zdarzenie.preventDefault();
    setNadObszarem(false);
    przyjmij(zdarzenie.dataTransfer.files);
  }

  function naZmianeWejscia(zdarzenie: ChangeEvent<HTMLInputElement>) {
    const pole = zdarzenie.target;
    try {
      if (pole.files) {
        przyjmij(skopiujListe(pole.files));
      }
    } finally {
      pole.value = "";
    }
  }

  return (
    <div className={style.oprawa}>
      <div
        id={`${id}-obszar`}
        role="button"
        tabIndex={0}
        aria-describedby={podpowiedzId}
        className={`${style.obszar} ${nadObszarem ? style.nadObszarem : ""}`}
        onClick={otworzWybor}
        onKeyDown={naKlawisz}
        onDragOver={(e) => {
          e.preventDefault();
          setNadObszarem(true);
        }}
        onDragLeave={() => setNadObszarem(false)}
        onDrop={naUpuszczenie}
      >
        <Text>{etykieta}</Text>
        <Hint id={podpowiedzId}>{podpowiedz}</Hint>
      </div>
      {!wiele && (
        <p id={`${id}-komunikat`} role="status" className={style.komunikat}>
          {komunikat}
        </p>
      )}
      <input
        ref={wejscie}
        id={id}
        type="file"
        multiple={wiele}
        accept={akceptuj}
        tabIndex={-1}
        aria-hidden="true"
        className={style.wejscieUkryte}
        onChange={naZmianeWejscia}
      />
      {pliki.length > 0 && (
        <ul className={style.lista}>
          {pliki.map((plik) => (
            <FileRow key={plik.nazwa} nazwa={plik.nazwa} stan={plik.stan} komunikat={plik.komunikat} />
          ))}
        </ul>
      )}
    </div>
  );
}
