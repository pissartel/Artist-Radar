import type { DashboardData } from "@/types";
import { mockDashboardData } from "@/data/mockDashboardData";

// TODO: replace with a real API call once the backend is ready:
// const response = await fetch("/api/dashboard");
// return response.json() as Promise<DashboardData>;
export async function getDashboardData(): Promise<DashboardData> {
  return mockDashboardData;
}
