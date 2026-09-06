export type ProfileStatus =
  | "draft"
  | "submitted"
  | "returned"
  | "accepted"
  | "withdrawn";

export type ProfileDocumentType = "dyplom" | "niekaralnosc" | "inne";

export interface ProfileDocument {
  id: number;
  type: ProfileDocumentType;
  uploaded_at: string;
}

export interface AdminProfileDocument extends ProfileDocument {
  download_url: string;
}

export interface PsychologistProfile {
  eligible: boolean;
  specializations: string[] | null;
  approach: string | null;
  city: string | null;
  bio: string | null;
  publication_consent_granted: boolean;
  status: ProfileStatus;
  return_reason: string | null;
  documents: ProfileDocument[];
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminPsychologistProfile {
  id: number;
  user: { id: number; first_name: string; last_name: string };
  specializations: string[] | null;
  approach: string | null;
  city: string | null;
  bio: string | null;
  publication_consent_granted: boolean;
  status: ProfileStatus;
  return_reason: string | null;
  decided_at: string | null;
  documents: AdminProfileDocument[];
  created_at: string;
  updated_at: string;
}
