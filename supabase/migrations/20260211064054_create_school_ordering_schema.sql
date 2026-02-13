/*
  # School Books & Stationery Ordering System - Complete Schema

  ## Overview
  Complete database schema for WhatsApp-based school ordering system with profiles, schools, 
  classes, items, orders, courier tracking, and WhatsApp message logging.

  ## New Tables
  
  ### Core Entities
  - `profiles` - User profiles for admin/team members
    - `id` (uuid, references auth.users)
    - `full_name` (text)
    - `role` (text, 'admin' or 'team')
    - `phone` (text)
    - `created_at` (timestamptz)

  - `schools` - School information with unique 4-digit codes
    - `id` (bigserial, primary key)
    - `name` (text, school name)
    - `code_4digit` (varchar(4), unique auto-generated code)
    - `address` (text)
    - `contact_phone` (text)
    - `active` (boolean)
    - `created_at` (timestamptz)

  - `classes` - Classes within schools
    - `id` (bigserial, primary key)
    - `school_id` (bigint, references schools)
    - `name` (text, e.g., "Class 1", "Class 2")
    - `sort_order` (int)

  - `groups` - Item groups (books/stationery categories)
    - `id` (bigserial, primary key)
    - `name` (text, group name)
    - `type` (text, 'books' or 'stationery')

  - `items` - Products available for ordering
    - `id` (bigserial, primary key)
    - `group_id` (bigint, references groups)
    - `title` (text, item name)
    - `sku` (text, stock keeping unit)
    - `description` (text)
    - `price_paise` (integer, price in paise)
    - `stock` (integer, available quantity)
    - `weight_grams` (integer, required for shipping)
    - `length_cm` (integer, for volumetric calculations)
    - `width_cm` (integer, for volumetric calculations)
    - `height_cm` (integer, for volumetric calculations)
    - `active` (boolean)
    - `metadata` (jsonb)

  - `class_group_assignments` - Maps which groups are available for which classes
    - `id` (bigserial, primary key)
    - `class_id` (bigint, references classes)
    - `group_id` (bigint, references groups)

  ### Order Management
  - `orders` - Customer orders with payment and courier tracking
    - `id` (bigserial, primary key)
    - `school_id` (bigint, references schools)
    - `class_id` (bigint, references classes)
    - `parent_phone` (text, customer phone)
    - `parent_name` (text, customer name)
    - `delivery_type` (text, 'school' or 'home')
    - `delivery_address` (text, for home delivery)
    - `delivery_charge_paise` (integer)
    - `items_total_paise` (integer)
    - `total_amount_paise` (integer)
    - `payment_id` (text, Razorpay order/payment ID)
    - `payment_status` (text, 'pending'/'paid'/'failed')
    - `status` (text, order lifecycle status)
    - `package_count` (int)
    - `package_weight_grams` (int, actual weight + packaging)
    - `package_volumetric_grams` (int, volumetric weight)
    - `billed_weight_grams` (int, max of actual and volumetric)
    - `courier_awb` (text, tracking number)
    - `courier_service` (text, courier name)
    - `created_at` (timestamptz)
    - `raw_request` (jsonb, full order request data)

  - `order_items` - Line items for each order
    - `id` (bigserial, primary key)
    - `order_id` (bigint, references orders)
    - `item_id` (bigint, references items)
    - `qty` (integer)
    - `unit_price_paise` (integer, snapshot of price at order time)

  ### Courier & Tracking
  - `courier_parcels` - Individual parcels with weight calculations
    - `id` (bigserial, primary key)
    - `order_id` (bigint, references orders)
    - `parcel_index` (int, for multi-parcel orders)
    - `actual_weight_grams` (int)
    - `length_cm` (int)
    - `width_cm` (int)
    - `height_cm` (int)
    - `volumetric_grams` (int)
    - `billed_weight_grams` (int)
    - `awb` (text, tracking number)

  - `courier_events` - Webhook events from courier
    - `id` (bigserial, primary key)
    - `order_id` (bigint, references orders)
    - `courier_name` (text)
    - `event_type` (text, e.g., 'picked', 'in_transit', 'delivered')
    - `event_payload` (jsonb, full event data)
    - `event_time` (timestamptz)

  ### Communication
  - `whatsapp_messages` - All WhatsApp message logs
    - `id` (bigserial, primary key)
    - `order_id` (bigint, nullable references orders)
    - `phone` (text, customer phone)
    - `direction` (text, 'in' or 'out')
    - `template_name` (text, for outgoing template messages)
    - `template_vars` (jsonb, template variables)
    - `raw_payload` (jsonb, full message data)
    - `status` (text, delivery status)
    - `ts` (timestamptz)

  - `whatsapp_conversations` - Conversation state tracking
    - `phone` (text, primary key)
    - `state` (text, current conversation state)
    - `context` (jsonb, state-specific data)
    - `last_message_at` (timestamptz)

  ### Configuration
  - `settings` - System-wide configuration
    - `id` (text, primary key, setting key)
    - `value` (jsonb, setting value)

  ## Security
  - Row Level Security (RLS) enabled on all tables
  - Admin users can access all data
  - Team users can read/update operational data
  - Public tables for webhook endpoints (no RLS on webhook event tables)
  
  ## Notes
  - All monetary values stored in paise (integers)
  - Weight in grams, dimensions in centimeters
  - School codes are 4-digit strings (1000-9999)
  - Timestamps use timestamptz with default now()
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text CHECK (role IN ('admin','team')) NOT NULL DEFAULT 'team',
  phone text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Authenticated users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Schools table
CREATE TABLE IF NOT EXISTS schools (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  code_4digit varchar(4) UNIQUE NOT NULL,
  address text,
  contact_phone text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read schools"
  ON schools FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin users can insert schools"
  ON schools FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can update schools"
  ON schools FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can delete schools"
  ON schools FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Classes table
CREATE TABLE IF NOT EXISTS classes (
  id bigserial PRIMARY KEY,
  school_id bigint NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int DEFAULT 0
);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read classes"
  ON classes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage classes"
  ON classes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  );

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  type text CHECK (type IN ('books','stationery')) NOT NULL
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read groups"
  ON groups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage groups"
  ON groups FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  );

-- Items table
CREATE TABLE IF NOT EXISTS items (
  id bigserial PRIMARY KEY,
  group_id bigint REFERENCES groups(id) ON DELETE SET NULL,
  title text NOT NULL,
  sku text,
  description text,
  price_paise integer NOT NULL,
  stock integer DEFAULT 0,
  weight_grams integer DEFAULT 0,
  length_cm integer,
  width_cm integer,
  height_cm integer,
  active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read items"
  ON items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage items"
  ON items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  );

-- Class-Group assignments table
CREATE TABLE IF NOT EXISTS class_group_assignments (
  id bigserial PRIMARY KEY,
  class_id bigint NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  group_id bigint NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  UNIQUE(class_id, group_id)
);

ALTER TABLE class_group_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read assignments"
  ON class_group_assignments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage assignments"
  ON class_group_assignments FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  );

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id bigserial PRIMARY KEY,
  school_id bigint REFERENCES schools(id),
  class_id bigint REFERENCES classes(id),
  parent_phone text NOT NULL,
  parent_name text,
  delivery_type text CHECK (delivery_type IN ('school','home')) NOT NULL,
  delivery_address text,
  delivery_charge_paise integer NOT NULL,
  items_total_paise integer NOT NULL,
  total_amount_paise integer NOT NULL,
  payment_id text,
  payment_link text,
  payment_status text CHECK (payment_status IN ('pending','paid','failed')) DEFAULT 'pending',
  status text CHECK (status IN ('pending','confirmed','processing','out_for_delivery','delivered','cancelled')) DEFAULT 'pending',
  package_count int DEFAULT 1,
  package_weight_grams int,
  package_volumetric_grams int,
  billed_weight_grams int,
  courier_awb text,
  courier_service text,
  created_at timestamptz DEFAULT now(),
  raw_request jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read orders"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage orders"
  ON orders FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  );

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id bigint REFERENCES items(id),
  qty integer DEFAULT 1,
  unit_price_paise integer NOT NULL
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read order items"
  ON order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage order items"
  ON order_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  );

-- Courier parcels table
CREATE TABLE IF NOT EXISTS courier_parcels (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  parcel_index int NOT NULL,
  actual_weight_grams int NOT NULL,
  length_cm int,
  width_cm int,
  height_cm int,
  volumetric_grams int NOT NULL,
  billed_weight_grams int NOT NULL,
  awb text
);

ALTER TABLE courier_parcels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read courier parcels"
  ON courier_parcels FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage courier parcels"
  ON courier_parcels FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'team')
    )
  );

-- Courier events table (public access for webhooks)
CREATE TABLE IF NOT EXISTS courier_events (
  id bigserial PRIMARY KEY,
  order_id bigint REFERENCES orders(id),
  courier_name text,
  event_type text,
  event_payload jsonb,
  event_time timestamptz DEFAULT now()
);

ALTER TABLE courier_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read courier events"
  ON courier_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert courier events"
  ON courier_events FOR INSERT
  TO service_role
  WITH CHECK (true);

-- WhatsApp messages table (public access for webhooks)
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id bigserial PRIMARY KEY,
  order_id bigint REFERENCES orders(id),
  phone text NOT NULL,
  direction text CHECK (direction IN ('in','out')) NOT NULL,
  template_name text,
  template_vars jsonb,
  raw_payload jsonb,
  status text,
  ts timestamptz DEFAULT now()
);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read whatsapp messages"
  ON whatsapp_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert whatsapp messages"
  ON whatsapp_messages FOR INSERT
  TO service_role
  WITH CHECK (true);

-- WhatsApp conversations state table
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  phone text PRIMARY KEY,
  state text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,
  last_message_at timestamptz DEFAULT now()
);

ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read conversations"
  ON whatsapp_conversations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage conversations"
  ON whatsapp_conversations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  id text PRIMARY KEY,
  value jsonb NOT NULL
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settings"
  ON settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin users can manage settings"
  ON settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_schools_code ON schools(code_4digit);
CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);
CREATE INDEX IF NOT EXISTS idx_items_group ON items(group_id);
CREATE INDEX IF NOT EXISTS idx_items_active ON items(active);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(parent_phone);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_courier_parcels_order ON courier_parcels(order_id);
CREATE INDEX IF NOT EXISTS idx_courier_events_order ON courier_events(order_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON whatsapp_messages(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_order ON whatsapp_messages(order_id);

-- Insert default settings
INSERT INTO settings (id, value) VALUES
  ('default_packaging_weight_grams', '50'::jsonb),
  ('volumetric_divisor', '5000'::jsonb),
  ('school_delivery_charge_paise', '5000'::jsonb),
  ('home_delivery_charge_paise', '15000'::jsonb),
  ('weight_rounding_grams', '500'::jsonb)
ON CONFLICT (id) DO NOTHING;