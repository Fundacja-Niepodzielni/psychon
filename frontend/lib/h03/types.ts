export type ApplicationStatus = "new" | "accepted" | "rejected";
export type ApplicationRole = "super_admin" | "project_manager" | "instructor" | "volunteer" | "student";

export interface ApplicationItem {
  id: number;
  edition_id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  source: string | null;
  role: ApplicationRole;
  payload: Record<string, unknown> | null;
  university: string | null;
  graduation_year: number | null;
  status: ApplicationStatus;
  rejection_reason: string | null;
  decided_by: number | null;
  decided_at: string | null;
  user_id: number | null;
  has_diploma_scan: boolean;
  diploma_scan_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CapacityReason {
  capacity: number;
  active: number;
  requested: number;
}
