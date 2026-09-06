export type InternshipStatus = "submitted" | "accepted" | "returned";
export type InternshipForm = "phone_duty" | "chat_duty" | "other";

export interface InternshipEntry {
  id: number;
  date: string;
  hours: string;
  form: InternshipForm;
  consultations_count: number;
  description: string | null;
  status: InternshipStatus;
  review_comment: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminInternshipEntry extends InternshipEntry {
  user: { id: number; first_name: string; last_name: string };
}
