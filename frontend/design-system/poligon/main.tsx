import { createRoot } from "react-dom/client";
import "../tokeny/tokeny.css";
import { Button } from "../atomy/Button/Button";
import { Link } from "../atomy/Link/Link";
import { Checkbox } from "../atomy/Checkbox/Checkbox";
import { Input } from "../atomy/Input/Input";
import { Textarea } from "../atomy/Textarea/Textarea";
import { Icon } from "../atomy/Icon/Icon";

// Motyw sterowany parametrem ?theme=dark|light, żeby Playwright mógł go
// ustawić przed pomiarem bez dotykania localStorage ani MVP.
const parametry = new URLSearchParams(window.location.search);
const motyw = parametry.get("theme");
if (motyw === "dark" || motyw === "light") {
  document.documentElement.setAttribute("data-theme", motyw);
}

function Poligon() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <p>Poligon pomiarowy P-7 — nie jest stroną produktu, tylko narzędziem pomiarowym.</p>
      <Button poziom="primary" data-testid="button-primary">Zapisz zmiany</Button>
      <Button poziom="outline" data-testid="button-outline">Anuluj</Button>
      <Button poziom="quiet" data-testid="button-quiet">Pomiń</Button>
      <Button poziom="primary" rozmiar="sm" data-testid="button-sm">Dodaj</Button>
      <Button poziom="quiet" data-testid="icon-button"><Icon nazwa="home" /></Button>
      <p><Link href="#" data-testid="link">Przejdź do lekcji</Link></p>
      <Checkbox id="pol-zgoda" zaznaczony onZmiana={() => {}} etykieta="Zgadzam się" />
      <Input rodzaj="tekst" aria-label="Imię" data-testid="input" />
      <Textarea aria-label="Opis" data-testid="textarea" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Poligon />);
