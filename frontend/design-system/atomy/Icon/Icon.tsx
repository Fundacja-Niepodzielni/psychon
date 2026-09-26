import {
  Home, BookOpen, Clock, Users, File, Award, MessageSquare,
  Inbox, BarChart, Settings, HelpCircle, User, LogOut,
} from "lucide-react";

const MAPA_IKON = {
  home: Home,
  book: BookOpen,
  clock: Clock,
  users: Users,
  file: File,
  award: Award,
  chat: MessageSquare,
  inbox: Inbox,
  chart: BarChart,
  cog: Settings,
  help: HelpCircle,
  user: User,
  out: LogOut,
} as const;

export type NazwaIkony = keyof typeof MAPA_IKON;

interface WlasciwosciIcon {
  nazwa: NazwaIkony;
  rozmiar?: 16 | 18 | 26;
}

/**
 * Ikona `Icon` (A12). Jeden plik, jeden glif pod jedną nazwą. Zawsze
 * `aria-hidden` — ikona nigdy nie jest jedynym nośnikiem znaczenia, obok niej
 * zawsze stoi tekst.
 */
export function Icon({ nazwa, rozmiar = 18 }: WlasciwosciIcon) {
  const Glif = MAPA_IKON[nazwa];
  return <Glif aria-hidden="true" width={rozmiar} height={rozmiar} strokeWidth={1.8} color="currentColor" />;
}
