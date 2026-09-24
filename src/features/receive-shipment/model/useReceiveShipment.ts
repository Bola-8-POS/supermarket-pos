/* eslint-disable import/order */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import {
  callReceiveShipment,
  type ReceiveShipmentRequest,
} from '@shared/lib/edge-function-contracts';
import { inventoryKeys } from '@entities/inventory';
import { purchaseOrderKeys } from '@entities/purchase-order';

/**
 * One idempotency key per submission attempt: generated the first time
 * `mutate`/`mutateAsync` runs, reused across a retry of that same attempt
 * (the RPC replays the original result instead of receiving twice), and
 * cleared only once the attempt actually succeeds so the next submission
 * gets a fresh key.
 */
export function useReceiveShipment() {
  const queryClient = useQueryClient();
  const idempotencyKeyRef = useRef<string | null>(null);
  return useMutation({
    mutationFn: (request: ReceiveShipmentRequest) => {
      idempotencyKeyRef.current ??= crypto.randomUUID();
      return callReceiveShipment({ ...request, idempotencyKey: idempotencyKeyRef.current });
    },
    onSuccess: result => {
      if (result.ok) {
        idempotencyKeyRef.current = null;
        void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        void queryClient.invalidateQueries({ queryKey: inventoryKeys.log() });
        void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all });
      }
    },
  });
}
