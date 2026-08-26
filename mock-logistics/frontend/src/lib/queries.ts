import { queryOptions, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { api } from "./api";

// ── Query Options ──────────────────────────────────────────────

export const healthQuery = queryOptions({
  queryKey: ["health"],
  queryFn: () => api.health(),
  refetchInterval: 7000,
  retry: false,
});

export const shipmentsQuery = queryOptions({
  queryKey: ["shipments"],
  queryFn: () => api.listShipments(),
  refetchInterval: 4000,
  retry: false,
});

export const webhookEventsQuery = queryOptions({
  queryKey: ["webhook-events"],
  queryFn: () => api.listWebhookEvents(),
  refetchInterval: 3000,
  retry: false,
});

export const shipmentQuery = (trackingId: string) =>
  queryOptions({
    queryKey: ["shipment", trackingId],
    queryFn: () => api.getShipment(trackingId),
    refetchInterval: 4000,
    retry: false,
  });

export const shipmentEventsQuery = (trackingId: string) =>
  queryOptions({
    queryKey: ["shipment-events", trackingId],
    queryFn: () => api.listShipmentEvents(trackingId),
    refetchInterval: 2500,
    retry: false,
  });

// ── Hooks ──────────────────────────────────────────────────────

export function useHealth() {
  return useQuery(healthQuery);
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["shipments"] });
    qc.invalidateQueries({ queryKey: ["shipment"] });
    qc.invalidateQueries({ queryKey: ["shipment-events"] });
    qc.invalidateQueries({ queryKey: ["webhook-events"] });
  };
}

export function useMarkTransit() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (trackingId: string) => api.markTransit(trackingId),
    onSuccess: invalidate,
  });
}

export function useMarkDelivered() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (trackingId: string) => api.markDelivered(trackingId),
    onSuccess: invalidate,
  });
}

export function useReportDamage() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (vars: { trackingId: string; reason: string }) =>
      api.reportDamage(vars.trackingId, vars.reason),
    onSuccess: invalidate,
  });
}

export function useRetryWebhook() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (eventId: string) => api.retryWebhook(eventId),
    onSuccess: invalidate,
  });
}

export function useResetShipment() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (trackingId: string) => api.resetShipment(trackingId),
    onSuccess: invalidate,
  });
}

export function useCreateShipment() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (vars: { orderId: string; itemCount: number }) =>
      api.createShipment(vars.orderId, vars.itemCount),
    onSuccess: invalidate,
  });
}
