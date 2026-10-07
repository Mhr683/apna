export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'PRODUCT_MANAGER'
  | 'ORDER_MANAGER'
  | 'CUSTOMER';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string; // e.g., "Obsidian Black / Medium"
  size?: string;
  color?: string;
  material?: string;
  price: number;
  stock: number;
}

export interface ProductStudioShot {
  shotType: string;
  caption: string;
  lightingSetup: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  approved?: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  shortDescription?: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  stock: number;
  reservedStock?: number;
  lowStockThreshold?: number;
  category: string;
  subcategory?: string;
  brand: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  featured?: boolean;
  bestSeller?: boolean;
  newArrival?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  primaryImage?: string;
  rating?: number;
  reviewCount?: number;
  weightKg?: number;
  dimensions?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  productCount?: number;
}

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  variantLabel?: string;
  primaryImage?: string;
  category: string;
}

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'PACKED'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'RETURNED';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED';
export type PaymentMethod = 'STRIPE' | 'PAYPAL' | 'COD' | 'MANUAL';

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  subtotal?: number;
  discount?: number;
  tax?: number;
  shippingFee?: number;
  total: number;
  couponCode?: string;
  shippingAddressSummary?: string;
  trackingNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING' | 'BOGO';
  value: number;
  minCartAmount?: number;
  maxDiscount?: number;
  categoryFilter?: string;
  usageLimit?: number;
  usedCount?: number;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
}

export interface Review {
  id: string;
  productId: string;
  productName?: string;
  userId: string;
  authorName: string;
  rating: number;
  title?: string;
  comment: string;
  verifiedPurchase?: boolean;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  helpfulCount?: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorName?: string;
  action: string;
  resource: string;
  details?: string;
  createdAt: string;
}

export interface AITask {
  id: string;
  actorUid: string;
  name: string;
  toolName: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  totalItems: number;
  completedItems: number;
  failedItems?: number;
  summary?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface StoreNotification {
  id: string;
  userId: string;
  type:
    | 'NEW_ORDER'
    | 'LOW_STOCK'
    | 'PAYMENT_FAILURE'
    | 'NEW_REVIEW'
    | 'REFUND'
    | 'IMPORT_FAILED'
    | 'AI_TASK_COMPLETED'
    | 'AI_TASK_FAILED';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface StoreSettings {
  id: string;
  storeName: string;
  contactEmail: string;
  currency: string;
  taxRate: number;
  freeShippingThreshold?: number;
  flatShippingRate?: number;
  guestCheckoutEnabled?: boolean;
  aiTone?: 'Professional' | 'Premium' | 'Friendly' | 'Minimal' | 'Luxury' | 'Persuasive';
  updatedAt?: string;
}

export interface AIMessageRecord {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolExecutions?: {
    name: string;
    args: Record<string, any>;
    status: 'EXECUTED' | 'PENDING_CONFIRMATION' | 'CANCELLED' | 'FAILED';
    resultSummary?: string;
  }[];
}
