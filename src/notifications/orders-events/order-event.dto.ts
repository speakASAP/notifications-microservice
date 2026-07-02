export const ORDERS_EVENT_SOURCE = 'orders-microservice';
export const ORDERS_EVENT_VERSION = 1;

export const ORDERS_EVENT_TYPES = {
  created: 'orders.order.created.v1',
  updated: 'orders.order.updated.v1',
  paid: 'orders.order.paid.v1',
  shipped: 'orders.order.shipped.v1',
  cancelled: 'orders.order.cancelled.v1',
  lifecycleChanged: 'orders.order.lifecycle_changed.v1',
} as const;

export type OrdersEventType = typeof ORDERS_EVENT_TYPES[keyof typeof ORDERS_EVENT_TYPES];

export const ORDERS_LIFECYCLE_STAGES = [
  'ordered_unpaid',
  'payment_failed',
  'paid_not_delivered',
  'warehouse_fulfillment_requested',
  'warehouse_collecting',
  'warehouse_forming',
  'warehouse_formed',
  'handed_to_delivery',
  'in_delivery',
  'received',
  'not_received',
  'returned',
  'cancelled',
] as const;

export type OrdersLifecycleStage = typeof ORDERS_LIFECYCLE_STAGES[number];

export interface OrdersEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  type: OrdersEventType;
  eventVersion: 1;
  eventId: string;
  occurredAt: string;
  source: typeof ORDERS_EVENT_SOURCE;
  payload: TPayload;
}

export interface OrderCreatedPayload extends Record<string, unknown> {
  orderId: string;
  channel: string;
}

export interface OrderUpdatedPayload extends Record<string, unknown> {
  orderId: string;
  status: string;
  previousStatus?: string;
}

export interface OrderPaidPayload extends Record<string, unknown> {
  orderId: string;
  paymentStatus: 'paid';
  paymentReferenceId?: string;
}

export interface OrderShippedPayload extends Record<string, unknown> {
  orderId: string;
  shipmentStatus: 'shipped';
  shipmentLookupRequired?: true;
}

export interface OrderCancelledPayload extends Record<string, unknown> {
  orderId: string;
  previousStatus?: string;
}

export interface OrderLifecycleChangedPayload extends Record<string, unknown> {
  orderId: string;
  lifecycleStage: OrdersLifecycleStage;
  previousLifecycleStage?: OrdersLifecycleStage | null;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  deliveryStatus: string;
  channel?: string;
  orderNumber?: string;
}

export type VerifiedOrdersEventEnvelope =
  | OrdersEventEnvelope<OrderCreatedPayload>
  | OrdersEventEnvelope<OrderUpdatedPayload>
  | OrdersEventEnvelope<OrderPaidPayload>
  | OrdersEventEnvelope<OrderShippedPayload>
  | OrdersEventEnvelope<OrderCancelledPayload>
  | OrdersEventEnvelope<OrderLifecycleChangedPayload>;

export type OrdersEventValidationResult =
  | { valid: true; event: VerifiedOrdersEventEnvelope }
  | { valid: false; reason: string };

type PayloadValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'customer',
  'customeremail',
  'customerphone',
  'email',
  'phone',
  'address',
  'billingaddress',
  'shippingaddress',
  'street',
  'postalcode',
  'paymentmethod',
  'card',
  'pan',
  'cvv',
  'iban',
  'token',
  'authorization',
  'bearer',
  'jwt',
  'secret',
  'password',
  'credential',
  'trackingnumber',
  'trackingurl',
  'operatoremail',
  'approveremail',
]);

const VALID_EVENT_TYPES = new Set<string>(Object.values(ORDERS_EVENT_TYPES));
const VALID_LIFECYCLE_STAGES = new Set<string>(ORDERS_LIFECYCLE_STAGES);

export function validateOrdersEventEnvelope(input: unknown): OrdersEventValidationResult {
  if (!isRecord(input)) {
    return { valid: false, reason: 'event_not_object' };
  }

  if (!isNonEmptyString(input.type) || !VALID_EVENT_TYPES.has(input.type)) {
    return { valid: false, reason: 'unsupported_event_type' };
  }

  if (input.eventVersion !== ORDERS_EVENT_VERSION) {
    return { valid: false, reason: 'unsupported_event_version' };
  }

  if (!isNonEmptyString(input.eventId)) {
    return { valid: false, reason: 'missing_event_id' };
  }

  if (!isNonEmptyString(input.occurredAt) || Number.isNaN(Date.parse(input.occurredAt))) {
    return { valid: false, reason: 'invalid_occurred_at' };
  }

  if (input.source !== ORDERS_EVENT_SOURCE) {
    return { valid: false, reason: 'unsupported_event_source' };
  }

  if (!isRecord(input.payload)) {
    return { valid: false, reason: 'payload_not_object' };
  }

  if (hasForbiddenPayloadKey(input.payload)) {
    return { valid: false, reason: 'payload_contains_forbidden_fields' };
  }

  const payloadResult = validatePayload(input.type as OrdersEventType, input.payload);
  if (payloadResult.valid === false) {
    return { valid: false, reason: payloadResult.reason };
  }

  return { valid: true, event: input as unknown as VerifiedOrdersEventEnvelope };
}

function validatePayload(type: OrdersEventType, payload: Record<string, unknown>): PayloadValidationResult {
  if (!isNonEmptyString(payload.orderId)) {
    return { valid: false, reason: 'missing_order_id' };
  }

  switch (type) {
    case ORDERS_EVENT_TYPES.created:
      if (!isNonEmptyString(payload.channel)) {
        return { valid: false, reason: 'missing_order_channel' };
      }
      return { valid: true };
    case ORDERS_EVENT_TYPES.updated:
      if (!isNonEmptyString(payload.status)) {
        return { valid: false, reason: 'missing_order_status' };
      }
      return { valid: true };
    case ORDERS_EVENT_TYPES.paid:
      if (payload.paymentStatus !== 'paid') {
        return { valid: false, reason: 'invalid_payment_status' };
      }
      return { valid: true };
    case ORDERS_EVENT_TYPES.shipped:
      if (payload.shipmentStatus !== 'shipped') {
        return { valid: false, reason: 'invalid_shipment_status' };
      }
      return { valid: true };
    case ORDERS_EVENT_TYPES.cancelled:
      return { valid: true };
    case ORDERS_EVENT_TYPES.lifecycleChanged:
      if (!isNonEmptyString(payload.lifecycleStage) || !VALID_LIFECYCLE_STAGES.has(payload.lifecycleStage)) {
        return { valid: false, reason: 'invalid_lifecycle_stage' };
      }
      for (const field of ['status', 'paymentStatus', 'fulfillmentStatus', 'deliveryStatus']) {
        if (!isNonEmptyString(payload[field])) {
          return { valid: false, reason: `missing_${field}` };
        }
      }
      return { valid: true };
    default:
      return { valid: false, reason: 'unsupported_event_type' };
  }
}

function hasForbiddenPayloadKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenPayloadKey(item));
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).some(([key, childValue]) => {
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return FORBIDDEN_PAYLOAD_KEYS.has(normalizedKey) || hasForbiddenPayloadKey(childValue);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
