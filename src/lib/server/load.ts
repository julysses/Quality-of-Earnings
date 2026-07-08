import { notFound } from "next/navigation";
import { createClient } from "../supabase/server";
import { getEngagementBundle } from "./data";
import { analyzeEngagement, type Analysis, type EngagementBundle } from "../analysis";

export async function loadAnalysis(
  engagementId: string,
): Promise<{ bundle: EngagementBundle; analysis: Analysis }> {
  const supabase = await createClient();
  const bundle = await getEngagementBundle(supabase, engagementId);
  if (!bundle) notFound();
  return { bundle, analysis: analyzeEngagement(bundle) };
}
