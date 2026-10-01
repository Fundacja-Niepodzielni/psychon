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
 */
export function FileDropZone({ id, etykieta, podpowiedz, pliki, onWybierzPliki }: WlasciwosciFileDropZone) {
  const [nadObszarem, setNadObszarem] = useState(false);
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

  function naUpuszczenie(zdarzenie: DragEvent<HTMLDivElement>) {
    zdarzenie.preventDefault();
    setNadObszarem(false);
    if (zdarzenie.dataTransfer.files.length > 0) {
      onWybierzPliki(zdarzenie.dataTransfer.files);
    }
  }

  function naZmianeWejscia(zdarzenie: ChangeEvent<HTMLInputElement>) {
    if (zdarzenie.target.files && zdarzenie.target.files.length > 0) {
      onWybierzPliki(zdarzenie.target.files);
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
      <input
        ref={wejscie}
        id={id}
        type="file"
        multiple
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
