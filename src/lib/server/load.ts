import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "../supabase/server";
import { getEngagementBundle } from "./data";
import { analyzeEngagement, type Analysis, type EngagementBundle } from "../analysis";

// cache() dedupes within a request: the engagement layout (stepper) and the
// page it wraps both call this, but the bundle loads once.
export const loadAnalysis = cache(
  async (engagementId: string): Promise<{ bundle: EngagementBundle; analysis: Analysis }> => {
    const supabase = await createClient();
    const bundle = await getEngagementBundle(supabase, engagementId);
    if (!bundle) notFound();
    return { bundle, analysis: analyzeEngagement(bundle) };
  },
);
