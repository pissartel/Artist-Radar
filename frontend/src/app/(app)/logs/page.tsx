import { notFound } from "next/navigation";
import AnalysisLogsPage from "@/components/debug/AnalysisLogsPage";
import { isDebugUIVisible } from "@/lib/server/debugUI";

export default function LogsPage() {
  if (!isDebugUIVisible()) notFound();
  return <AnalysisLogsPage />;
}
