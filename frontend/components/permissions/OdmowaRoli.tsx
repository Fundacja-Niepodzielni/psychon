"use client";

import "@/design-system/tokeny/tokeny.css";
import { useRouter } from "next/navigation";
import { ADRES_PULPITU, EkranOdmowy } from "@/nowy-front/wspolne/ekran-odmowy";

interface OdmowaRoliProps {
  /** Rola, dla której jest ekran, w dopełniaczu liczby mnogiej („wolontariuszy”). */
  rolaDocelowa: string;
}

/**
 * Odmowa roli na stronach starej grupy tras uczestnika: wspólny ekran odmowy nowej ramki
 * (nagłówek „Nie masz dostępu do tego ekranu”, zdanie o roli zalogowanej osoby i jeden przycisk
 * z powrotem do pulpitu). Wstawia go `RequireRole` zamiast treści ekranu, więc formularza ani
 * żadnych danych strony osoba bez roli nie widzi.
 */
export default function OdmowaRoli({ rolaDocelowa }: OdmowaRoliProps) {
  const router = useRouter();

  return (
    <div data-theme="light" style={{ padding: "var(--space-24)" }}>
      <EkranOdmowy
        rodzaj="brak-dostepu"
        rolaDocelowa={rolaDocelowa}
        przycisk={{ onClick: () => router.push(ADRES_PULPITU) }}
      />
    </div>
  );
}
