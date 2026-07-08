import type { SupabaseClient } from "@supabase/supabase-js";

// Append-only audit trail; every mutation path calls this. Failures are
// logged but never block the user action itself.
export async function logAudit(
  supabase: SupabaseClient,
  event: {
    orgId: string;
    engagementId?: string | null;
    userId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    detail?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("audit_events").insert({
    org_id: event.orgId,
    engagement_id: event.engagementId ?? null,
    user_id: event.userId ?? null,
    action: event.action,
    entity_type: event.entityType ?? null,
    entity_id: event.entityId ?? null,
    detail: event.detail ?? null,
  });
  if (error) console.error("audit_events insert failed:", error.message);
}
