export interface WiadomoscEmail {
  id: number;
  to_email: string;
  subject: string;
  body_html: string;
  status: "queued" | "sent" | "failed" | "simulated";
  sent_at: string | null;
  created_at: string;
}

export interface MetaSkrzynki {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  extra?: { from: { address: string; name: string | null } | null };
}
