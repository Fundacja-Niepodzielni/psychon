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
