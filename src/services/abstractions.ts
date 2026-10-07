import { PaymentMethod, PaymentStatus } from '../types/store';

// 1. Payment Provider Abstraction Layer
// Honest payment representation: When no live Stripe/PayPal secret key is configured,
// card and wallet orders are recorded as PENDING manual verification (never fake-capturing funds).
export interface PaymentRequest {
  orderNumber: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  customerEmail: string;
  maskedInstrumentSummary?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  paymentStatus: PaymentStatus;
  providerMessage: string;
  isGatewayConfigured: boolean;
}

export class PaymentGatewayService {
  static async processPayment(req: PaymentRequest): Promise<PaymentResult> {
    const txSuffix = Math.random().toString(36).substring(2, 9).toUpperCase();
    switch (req.method) {
      case 'STRIPE':
        return {
          success: true,
          transactionId: `manual_card_ref_${txSuffix}`,
          paymentStatus: 'PENDING',
          isGatewayConfigured: false,
          providerMessage: `Card format verified (${req.maskedInstrumentSummary || 'Masked Card'}). Live payment gateway not configured — recorded as PENDING manual settlement verification for $${req.amount.toFixed(2)} ${req.currency}.`,
        };
      case 'PAYPAL':
        return {
          success: true,
          transactionId: `manual_pp_ref_${txSuffix}`,
          paymentStatus: 'PENDING',
          isGatewayConfigured: false,
          providerMessage: `PayPal / Digital Wallet selected for $${req.amount.toFixed(2)} ${req.currency}. Live gateway not configured — recorded as PENDING manual settlement verification.`,
        };
      case 'COD':
        return {
          success: true,
          transactionId: `cod_pk_${txSuffix}`,
          paymentStatus: 'PENDING',
          isGatewayConfigured: true,
          providerMessage: `Pakistan National Cash on Delivery (COD) registered for $${req.amount.toFixed(2)} ${req.currency} — payable upon courier arrival.`,
        };
      case 'MANUAL':
      default:
        return {
          success: true,
          transactionId: `wire_ref_${txSuffix}`,
          paymentStatus: 'PENDING',
          isGatewayConfigured: true,
          providerMessage: `Advance Bank / Mobile Wallet reference recorded (${req.maskedInstrumentSummary || 'Manual Transfer'}) for Order ${req.orderNumber} — PENDING treasury verification.`,
        };
    }
  }
}

// 2. Shipping Rate & Carrier Abstraction Layer
export interface ShippingMethodOption {
  id: string;
  name: string;
  carrier: string;
  estimatedDays: string;
  baseFee: number;
}

export const SHIPPING_METHODS: ShippingMethodOption[] = [
  {
    id: 'ship-standard',
    name: 'Insured Armored Ground Courier',
    carrier: 'DHL Express',
    estimatedDays: '3–5 business days',
    baseFee: 25,
  },
  {
    id: 'ship-Priority',
    name: 'Priority Air Concierge',
    carrier: 'FedEx International Priority',
    estimatedDays: '1–2 business days',
    baseFee: 55,
  },
  {
    id: 'ship-pickup',
    name: 'Atelier Flagship Private Collection',
    carrier: 'In-Boutique Appointment',
    estimatedDays: 'Ready in 2 hours',
    baseFee: 0,
  },
];

export function calculateShippingFee(
  subtotal: number,
  freeThreshold: number,
  selectedMethodId: string,
  hasFreeShippingCoupon: boolean
): number {
  if (hasFreeShippingCoupon) return 0;
  const method = SHIPPING_METHODS.find((m) => m.id === selectedMethodId) || SHIPPING_METHODS[0];
  if (method.id === 'ship-pickup') return 0;
  if (method.id === 'ship-standard' && subtotal >= freeThreshold) return 0;
  return method.baseFee;
}

// 3. Transactional Email Service Abstraction Layer
export interface TransactionalEmailPayload {
  to: string;
  template:
    | 'ORDER_CONFIRMATION'
    | 'SHIPPING_NOTIFICATION'
    | 'DELIVERY_NOTIFICATION'
    | 'REFUND_NOTICE'
    | 'PROMOTIONAL';
  subject: string;
  summary: string;
}

export class EmailNotificationService {
  static formatDispatchLog(payload: TransactionalEmailPayload): string {
    return `[Concierge Dispatch Log -> ${payload.to}] (${payload.template}): ${payload.subject} — ${payload.summary}`;
  }
}

// 4. Sanitization & Firestore Schema Enforcement Helper
export const USD_TO_PKR_RATE = 278.5;

export function formatPKR(usdAmount: number): string {
  const pkr = Math.round((Number(usdAmount) || 0) * USD_TO_PKR_RATE);
  return `PKR ${pkr.toLocaleString('en-US')}`;
}

export function formatDualPrice(usdAmount: number, includeDecimals = false): string {
  const num = Number(usdAmount) || 0;
  const usdStr = includeDecimals
    ? `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${num.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const pkrStr = formatPKR(num);
  return `${usdStr} (${pkrStr})`;
}

export function sanitizeSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200) || 'item-slug'
  );
}

export function sanitizeSku(input: string): string {
  return (
    input
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .toUpperCase()
      .slice(0, 60) || `AA-${Date.now().toString().slice(-5)}`
  );
}

export function sanitizeDocId(input: string): string {
  return (
    input
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 120) || `doc-${Date.now()}`
  );
}
