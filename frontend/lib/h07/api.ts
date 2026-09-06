import { api, apiPaged, type PaginationMeta } from "@/lib/api";

export interface ReliabilityPerson {
  id: number;
  first_name: string;
  last_name: string;
  reliability_percent: string | null;
  below_threshold: boolean;
}

export interface AdminReliabilityPerson extends ReliabilityPerson {
  email: string;
}

export interface ReliabilityLesson {
  id: number;
  title: string;
  active_seconds: number;
  duration_seconds: number;
  open_count: number;
  last_activity_at: string | null;
  below_threshold: boolean;
}

export interface AdminReliabilityDetail extends AdminReliabilityPerson {
  lessons: ReliabilityLesson[];
}

export function fetchAdminReliability(
  page = 1,
  perPage = 25,
): Promise<{ data: AdminReliabilityPerson[]; meta?: PaginationMeta }> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });

  return apiPaged<AdminReliabilityPerson>(`/admin/reliability?${params}`);
}

export function fetchAdminReliabilityDetail(
  userId: number,
): Promise<AdminReliabilityDetail> {
  return api<AdminReliabilityDetail>(`/admin/reliability/${userId}`);
}

export async function fetchInstructorReliability(): Promise<
  ReliabilityPerson[]
> {
  const response = await apiPaged<ReliabilityPerson>(
    "/instructor/reliability",
  );

  return response.data;
}
