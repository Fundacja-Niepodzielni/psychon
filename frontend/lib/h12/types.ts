export type Attendance = "present" | "absent";

export interface ParticipantSignup {
  signed_up_at: string;
  attendance: Attendance | null;
}

export interface ParticipantSlot {
  id: number;
  starts_at: string;
  duration_minutes: number;
  seats_limit: number;
  location_or_link: string | null;
  active_signups_count: number;
  available_seats: number;
  is_full: boolean;
  signup: ParticipantSignup | null;
}

export interface InstructorSignup {
  user: { id: number; first_name: string; last_name: string };
  signed_up_at: string;
  attendance: Attendance | null;
}

export interface InstructorSlot {
  id: number;
  starts_at: string;
  duration_minutes: number;
  seats_limit: number;
  location_or_link: string | null;
  active_signups_count: number;
  available_seats: number;
  signups: InstructorSignup[];
}

export interface InstructorProgress {
  courses_done: number;
  courses_total: number;
  hours_accepted: string;
  supervision_present: number;
  workshop_done: boolean;
}

export interface GroupMember {
  id: number;
  first_name: string;
  last_name: string;
  progress: InstructorProgress;
}

export interface InstructorGroup {
  members: GroupMember[];
  slots: InstructorSlot[];
}
