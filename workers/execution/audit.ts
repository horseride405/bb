import type { Database, Json } from "@/lib/supabase/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type WorkerClient = SupabaseClient<Database>;

export async function recordWorkerAuditEvent(
  client: WorkerClient,
  input: {
    workspaceId: string;
    eventType: string;
    resourceType: string;
    resourceId: string;
    metadata?: Json;
  },
) {
  const { error } = await client.from("audit_events").insert({
    workspace_id: input.workspaceId,
    actor_user_id: null,
    event_type: input.eventType,
    resource_type: input.resourceType,
    resource_id: input.resourceId,
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error(`Unable to persist worker audit event: ${error.message}`);
}
