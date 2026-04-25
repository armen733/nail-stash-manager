import { supabase } from "@/integrations/supabase/client";

export type AuditAction = "create" | "update" | "delete" | "export" | "import" | "payout" | "payment" | "other";
export type AuditEntity =
  | "order"
  | "product"
  | "salon"
  | "user"
  | "commission"
  | "stock"
  | "warehouse"
  | "referrer"
  | "promotion"
  | "tax"
  | "loyalty"
  | "supply_store"
  | "other";

interface LogParams {
  action: AuditAction;
  entityType: AuditEntity;
  entityId?: string | null;
  entityLabel?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Fire-and-forget audit log writer. Never throws — failures are logged to console only,
 * so callers don't need to wrap in try/catch.
 */
export async function logAudit(params: LogParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    let actorName: string | null = null;
    let actorEmail: string | null = user?.email ?? null;

    if (user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      actorName = profile?.full_name ?? null;
      actorEmail = profile?.email ?? actorEmail;
    }

    await supabase.from("audit_logs").insert({
      actor_id: user?.id ?? null,
      actor_name: actorName,
      actor_email: actorEmail,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      entity_label: params.entityLabel ?? null,
      summary: params.summary ?? null,
      metadata: (params.metadata ?? {}) as never,
    });
  } catch (err) {
    // Never block app flow on audit failures
    console.warn("[audit] failed to write log entry", err);
  }
}
