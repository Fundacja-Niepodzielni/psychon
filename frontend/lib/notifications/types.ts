/** Kształt zgodny z kontraktem §2 — Powiadomienia (GET /notifications). */
export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

/** Wiersz skrzynki e-maili symulowanych (GET /admin/emails). */
export interface EmailItem {
  id: number;
  to_email: string;
  subject: string;
  body_html: string | null;
  status: "queued" | "sent" | "failed" | "simulated";
  sent_at: string | null;
  created_at: string;
}

/**
 * Rzeczywisty skonfigurowany nadawca (`meta.extra.from`, GET /admin/emails)
 * — odczyt zaplecza (`MAIL_FROM_ADDRESS` / `MAIL_FROM_NAME`), nie literał
 * ekranu. `null`, gdy adres nie jest ustawiony.
 */
export interface EmailSender {
  address: string;
  name: string | null;
}
