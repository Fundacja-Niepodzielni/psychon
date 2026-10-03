"use client";

import { getSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/design-system/atomy/Button/Button";
import { Heading } from "@/design-system/atomy/Heading/Heading";
import { Text } from "@/design-system/atomy/Text/Text";
import { api, ApiError } from "@/lib/api";
import { homeForRole } from "@/lib/home-by-role";
import { Karta } from "../wspolne/strona-publiczna/Karta";
import { Komunikat } from "../wspolne/strona-publiczna/Komunikat";
import { RamaPubliczna } from "../wspolne/strona-publiczna/RamaPubliczna";
import { Wczytywanie } from "../wspolne/strona-publiczna/Wczytywanie";
import style from "../wspolne/strona-publiczna/publiczne.module.css";
import {
  DOSTAWCA_LOGOWANIA,
  ETYKIETA_LOGOWANIA,
  KOMUNIKAT_BRAKU_POLACZENIA,
  KOMUNIKAT_LIMITU_CZASU,
  LIMIT_CZASU_LOGOWANIA_MS,
  OPIS_LOGOWANIA,
  POWROT_PO_LOGOWANIU,
  PRZEKIEROWUJE,
  TYTUL_LOGOWANIA,
  czyZalogowana,
  komunikatAwariiStartu,
  komunikatBleduLogowania,
} from "./logika";

interface Me {
  role: string;
}

interface WlasciwosciEkranu {
  logo?: ReactNode;
}

function Uklad({ logo, children }: WlasciwosciEkranu & { children: ReactNode }) {
  return (
    <RamaPubliczna logo={logo}>
      <Karta>
        <Heading stopien={1}>{TYTUL_LOGOWANIA}</Heading>
        <Text>{OPIS_LOGOWANIA}</Text>
        {children}
      </Karta>
    </RamaPubliczna>
  );
}

/**
 * Ekran logowania w nowym wyglądzie — ten sam przebieg co `app/logowanie/page.tsx`:
 * sesja żywa → `GET /me` i lądowanie wg roli; `?error=` → komunikat i przycisk;
 * brak sesji → logowanie przez konto Niepodzielni bez kliknięcia. Zegar
 * `LIMIT_CZASU_LOGOWANIA_MS` rozstrzyga, gdy nic innego nie rozstrzygnie.
 */
function EkranLogowania({ logo }: WlasciwosciEkranu) {
  const router = useRouter();
  const params = useSearchParams();
  const kodBledu = params.get("error");
  const [komunikat, setKomunikat] = useState<string | null>(null);

  useEffect(() => {
    let anulowane = false;
    const zegar = setTimeout(() => setKomunikat(KOMUNIKAT_LIMITU_CZASU), LIMIT_CZASU_LOGOWANIA_MS);

    async function uruchom() {
      try {
        const sesja = await getSession();
        if (anulowane) return;

        if (czyZalogowana(sesja)) {
          try {
            const me = await api<Me>("/me");
            if (anulowane) return;
            clearTimeout(zegar);
            router.replace(homeForRole(me.role));
          } catch (wyjatek) {
            if (anulowane) return;
            // 401 obsługuje już klient API (przekierowanie przeglądarki); zegar zostaje siatką bezpieczeństwa.
            if (!(wyjatek instanceof ApiError && wyjatek.status === 401)) {
              clearTimeout(zegar);
              setKomunikat(KOMUNIKAT_BRAKU_POLACZENIA);
            }
          }
          return;
        }

        if (kodBledu) {
          clearTimeout(zegar);
          setKomunikat(komunikatBleduLogowania(kodBledu));
          return;
        }

        await signIn(DOSTAWCA_LOGOWANIA, POWROT_PO_LOGOWANIU);
        if (anulowane) return;
        clearTimeout(zegar);
      } catch (wyjatek) {
        if (anulowane) return;
        clearTimeout(zegar);
        setKomunikat(komunikatAwariiStartu(wyjatek));
      }
    }

    void uruchom();
    return () => {
      anulowane = true;
      clearTimeout(zegar);
    };
    // Wyłącznie przy zamontowaniu — tak jak na starej stronie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!komunikat) {
    return (
      <Uklad logo={logo}>
        <Wczytywanie etykieta={PRZEKIEROWUJE} wiersze={1} />
      </Uklad>
    );
  }

  return (
    <Uklad logo={logo}>
      <Komunikat wariant="error">
        <p>{komunikat}</p>
      </Komunikat>
      <div className={style.przyciski}>
        <Button poziom="primary" type="button" onClick={() => void signIn(DOSTAWCA_LOGOWANIA, POWROT_PO_LOGOWANIU)}>
          {ETYKIETA_LOGOWANIA}
        </Button>
      </div>
    </Uklad>
  );
}

export function Logowanie({ logo }: WlasciwosciEkranu) {
  return (
    <Suspense
      fallback={
        <Uklad logo={logo}>
          <Wczytywanie etykieta={PRZEKIEROWUJE} wiersze={1} />
        </Uklad>
      }
    >
      <EkranLogowania logo={logo} />
    </Suspense>
  );
}
