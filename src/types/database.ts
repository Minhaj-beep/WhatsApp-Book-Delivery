export interface Profile {
  id: string;
  full_name: string | null;
  role: 'admin' | 'team';
  phone: string | null;
  created_at: string;
}

export interface School {
  id: number;
  name: string;
  code_4digit: string;
  address: string | null;
  contact_phone: string | null;
  active: boolean;
  created_at: string;
}

export interface Class {
  id: number;
  school_id: number;
  name: string;
  sort_order: number;
}

export interface Group {
  id: number;
  name: string;
  type: 'books' | 'stationery';
}

export interface Item {
  id: number;
  group_id: number | null;
  title: string;
  sku: string | null;
  description: string | null;
  price_paise: number;
  stock: number;
  weight_grams: number;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  active: boolean;
  metadata: Record<string, unknown>;
}

export interface ClassGroupAssignment {
  id: number;
  class_id: number;
  group_id: number;
}

export type DeliveryType = 'school' | 'home';
export type PaymentStatus = 'pending' | 'paid' | 'failed';
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'out_for_delivery' | 'delivered' | 'cancelled';

export interface Order {
  id: number;
  school_id: number | null;
  class_id: number | null;
  parent_phone: string;
  parent_name: string | null;
  delivery_type: DeliveryType;
  delivery_address: string | null;
  delivery_charge_paise: number;
  items_total_paise: number;
  total_amount_paise: number;
  payment_id: string | null;
  payment_status: PaymentStatus;
  status: OrderStatus;
  package_count: number;
  package_weight_grams: number | null;
  package_volumetric_grams: number | null;
  billed_weight_grams: number | null;
  courier_awb: string | null;
  courier_service: string | null;
  created_at: string;
  raw_request: Record<string, unknown>;
}

export interface OrderItem {
  id: number;
  order_id: number;
  item_id: number | null;
  qty: number;
  unit_price_paise: number;
}

export interface CourierParcel {
  id: number;
  order_id: number;
  parcel_index: number;
  actual_weight_grams: number;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  volumetric_grams: number;
  billed_weight_grams: number;
  awb: string | null;
}

export interface CourierEvent {
  id: number;
  order_id: number | null;
  courier_name: string | null;
  event_type: string | null;
  event_payload: Record<string, unknown> | null;
  event_time: string;
}

export type MessageDirection = 'in' | 'out';

export interface WhatsAppMessage {
  id: number;
  order_id: number | null;
  phone: string;
  direction: MessageDirection;
  template_name: string | null;
  template_vars: Record<string, unknown> | null;
  raw_payload: Record<string, unknown> | null;
  status: string | null;
  ts: string;
}

export interface WhatsAppConversation {
  phone: string;
  state: string;
  context: Record<string, unknown>;
  last_message_at: string;
}

export interface Setting {
  id: string;
  value: unknown;
}

export interface OrderWithDetails extends Order {
  school?: School;
  class?: Class;
  items?: Array<OrderItem & { item?: Item }>;
}

export interface DashboardStats {
  pending_payments: number;
  confirmed_orders: number;
  out_for_delivery: number;
  total_orders_today: number;
  total_revenue_today_paise: number;
}
