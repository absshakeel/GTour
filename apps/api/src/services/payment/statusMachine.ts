import { PaymentStatus, RefundStatus } from '@gtour/shared-types';

/**
 * Legal payment status moves.
 *
 * `SUCCESSFUL` is terminal: money that has settled cannot be un-settled by a
 * status change, only by a refund, which moves it to `PARTIALLY_REFUNDED` or
 * `REFUNDED`. Enforcing this centrally stops a late or replayed gateway
 * notification from reopening a captured payment.
 */
const TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [
    PaymentStatus.PROCESSING,
    PaymentStatus.SUCCESSFUL,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
    PaymentStatus.EXPIRED,
  ],
  [PaymentStatus.PROCESSING]: [
    PaymentStatus.SUCCESSFUL,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
    PaymentStatus.EXPIRED,
  ],
  [PaymentStatus.SUCCESSFUL]: [
    PaymentStatus.PARTIALLY_REFUNDED,
    PaymentStatus.REFUNDED,
  ],
  [PaymentStatus.PARTIALLY_REFUNDED]: [
    PaymentStatus.REFUNDED,
    PaymentStatus.PARTIALLY_REFUNDED,
  ],
  [PaymentStatus.REFUNDED]: [],
  [PaymentStatus.FAILED]: [PaymentStatus.PROCESSING],
  [PaymentStatus.CANCELLED]: [PaymentStatus.PROCESSING],
  [PaymentStatus.EXPIRED]: [PaymentStatus.PROCESSING],
  // Legacy rows written before the gateway existed.
  [PaymentStatus.COMPLETED]: [
    PaymentStatus.PARTIALLY_REFUNDED,
    PaymentStatus.REFUNDED,
  ],
};

/** Refund lifecycle moves. `SUCCEEDED` is terminal. */
const REFUND_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  [RefundStatus.PENDING]: [
    RefundStatus.PROCESSING,
    RefundStatus.SUCCEEDED,
    RefundStatus.FAILED,
    RefundStatus.CANCELLED,
  ],
  [RefundStatus.PROCESSING]: [
    RefundStatus.SUCCEEDED,
    RefundStatus.FAILED,
    // The gateway can withdraw an in-flight refund without ever failing it.
    RefundStatus.CANCELLED,
  ],
  [RefundStatus.SUCCEEDED]: [],
  [RefundStatus.FAILED]: [RefundStatus.PROCESSING],
  [RefundStatus.CANCELLED]: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return from === to || (TRANSITIONS[from]?.includes(to) ?? false);
}

export function assertTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransition(from, to)) {
    throw new PaymentStateError(`A payment cannot move from ${from} to ${to}`, from, to);
  }
}

export function canTransitionRefund(from: RefundStatus, to: RefundStatus): boolean {
  return from === to || (REFUND_TRANSITIONS[from]?.includes(to) ?? false);
}

export function assertRefundTransition(from: RefundStatus, to: RefundStatus): void {
  if (!canTransitionRefund(from, to)) {
    throw new PaymentStateError(`A refund cannot move from ${from} to ${to}`, from, to);
  }
}

/** Raised when a status move is illegal; callers map it onto a 409. */
export class PaymentStateError extends Error {
  constructor(
    message: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(message);
    this.name = 'PaymentStateError';
  }
}
