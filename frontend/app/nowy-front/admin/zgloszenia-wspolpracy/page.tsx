import { ZgloszeniaWspolpracy } from "@/nowy-front/zgloszenia-wspolpracy/ZgloszeniaWspolpracy";

/**
 * Trasa `/nowy-front/admin/zgloszenia-wspolpracy` — obsługa zgłoszeń
 * dalszej współpracy (H01, `AdminCooperationRequestController`). Odczyt
 * i zapis biegną z przeglądarki (`ZgloszeniaWspolpracy.tsx`) — powód
 * opisany tam.
 */
export default function StronaZgloszenWspolpracy() {
  return <ZgloszeniaWspolpracy />;
}
