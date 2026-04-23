/**
 * Offline order queue.
 * When the device is offline, new orders are stashed in IndexedDB (via idb-keyval)
 * and silently flushed to Supabase the moment we go back online.
 *
 * Uses a dedicated idb-keyval store so queue lookups don't scan unrelated keys.
 */
import { get, set, del, keys, createStore } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit-log";

// Dedicated store — keys() only returns queued orders, not unrelated app data.
const queueStore = createStore("offline-orders-db", "orders");

export interface QueuedOrderItem {
  product_id: string;
  product_name?: string;
  sku?: string;
  quantity: number;
  unit_price: number;
}

export interface QueuedOrder {
  localId: string;
  queuedAt: number;
  salon_id: string | null;
  profile_id: string | null;
  notes: string | null;
  created_by: string | null;
  status: "Draft";
  subtotal: number;
  tax: number;
  total: number;
  items: QueuedOrderItem[];
  customer_label: string;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export async function enqueueOrder(order: Omit<QueuedOrder, "localId" | "queuedAt">): Promise<QueuedOrder> {
  const localId =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const queued: QueuedOrder = { ...order, localId, queuedAt: Date.now() };
  await set(localId, queued, queueStore);
  return queued;
}

export async function getQueuedOrders(): Promise<QueuedOrder[]> {
  const queueKeys = await keys(queueStore);
  const results: QueuedOrder[] = [];
  for (const k of queueKeys) {
    const v = await get<QueuedOrder>(k as string, queueStore);
    if (v) results.push(v);
  }
  return results.sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function removeQueuedOrder(localId: string): Promise<void> {
  await del(localId, queueStore);
}

export async function queueLength(): Promise<number> {
  const queueKeys = await keys(queueStore);
  return queueKeys.length;
}

/** Push a single queued order to Supabase. Returns true on success. */
async function syncOne(q: QueuedOrder): Promise<boolean> {
  try {
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert([
        {
          salon_id: q.salon_id,
          profile_id: q.profile_id,
          notes: q.notes,
          created_by: q.created_by,
          status: q.status,
          subtotal: q.subtotal,
          tax: q.tax,
          total: q.total,
        },
      ])
      .select()
      .single();
    if (orderErr || !order) throw orderErr ?? new Error("No order returned");

    const itemRows = q.items.map((it) => ({
      order_id: order.id,
      product_id: it.product_id,
      quantity: it.quantity,
      unit_price: it.unit_price,
      line_total: it.quantity * it.unit_price,
    }));
    const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
    if (itemsErr) throw itemsErr;

    await logAudit({
      action: "create",
      entityType: "order",
      entityId: order.id,
      entityLabel: (order as any).invoice_number ?? order.id.slice(0, 8),
      summary: `Synced offline order for ${q.customer_label} (${q.items.length} items, $${q.total.toFixed(2)})`,
      metadata: {
        offline_synced: true,
        queued_at: new Date(q.queuedAt).toISOString(),
        item_count: q.items.length,
      },
    });
    return true;
  } catch (err) {
    console.error("[offline-queue] sync failed for", q.localId, err);
    return false;
  }
}

let syncing = false;

export interface SyncResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

/** Flush every queued order. Safe to call multiple times — guarded against re-entry. */
export async function flushQueue(): Promise<SyncResult> {
  if (syncing) return { attempted: 0, succeeded: 0, failed: 0 };
  syncing = true;
  let succeeded = 0;
  let failed = 0;
  try {
    const queue = await getQueuedOrders();
    for (const q of queue) {
      const ok = await syncOne(q);
      if (ok) {
        await removeQueuedOrder(q.localId);
        succeeded++;
      } else {
        failed++;
      }
    }
    return { attempted: queue.length, succeeded, failed };
  } finally {
    syncing = false;
  }
}
