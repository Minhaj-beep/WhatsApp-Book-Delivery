# School Books & Stationery Ordering System

A comprehensive WhatsApp-based ordering system for school books and stationery with an admin panel for managing schools, inventory, orders, and shipments.

## Overview

This system allows parents to order school supplies via WhatsApp using a simple 4-digit school code. The admin team uses a React-based web application to manage the entire operation including schools, items, orders, payments, and courier integrations.

## Tech Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Payments**: Razorpay
- **Courier**: Delhivery
- **Messaging**: WhatsApp Business API (Twilio/Gupshup/Meta BSP)

## Features

### Admin Panel
- **Dashboard**: Real-time KPIs (pending payments, confirmed orders, deliveries)
- **School Management**: CRUD operations with auto-generated 4-digit codes
- **Class Management**: Manage classes within each school
- **Items & Groups**: Catalog management with weight/dimension tracking
- **Class-Group Assignments**: Link product groups to specific classes
- **Order Management**: View, filter, and manage all orders
- **Settings**: Configure shipping parameters and delivery charges

### WhatsApp Ordering Flow
1. Parent sends 4-digit school code
2. System validates code and shows available classes
3. Parent selects class and category (books/stationery)
4. Parent chooses delivery type (school/home)
5. System creates order and generates Razorpay payment link
6. Payment confirmation triggers order processing
7. Admin creates shipment with Delhivery
8. Automated status updates via WhatsApp

### Edge Functions
- `compute-weights`: Calculate actual, volumetric, and billed weights
- `create-order`: Handle order creation from WhatsApp
- `razorpay-webhook`: Process payment confirmations
- `delhivery-webhook`: Handle shipping status updates
- `whatsapp-webhook`: Process incoming WhatsApp messages
- `create-shipment`: Generate AWB and create courier shipment

## Database Schema

### Core Tables
- `profiles`: User accounts (admin/team roles)
- `schools`: School information with unique 4-digit codes
- `classes`: Classes within schools
- `groups`: Item categories (books/stationery)
- `items`: Products with pricing and dimensions
- `class_group_assignments`: Maps groups to classes

### Order Management
- `orders`: Customer orders with payment and shipping info
- `order_items`: Line items with quantity and price snapshots
- `courier_parcels`: Parcel details with weight calculations
- `courier_events`: Shipping status event log
- `whatsapp_messages`: All incoming/outgoing messages
- `whatsapp_conversations`: Active conversation state tracking

### Configuration
- `settings`: System-wide settings (weights, charges, etc.)

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- Supabase account and project
- Razorpay account (for payments)
- Delhivery account (for shipping)
- WhatsApp Business API access

### 1. Clone and Install

```bash
git clone <repository-url>
cd school-ordering-system
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Database Setup

The database migration has already been applied to your Supabase instance, creating all necessary tables with proper Row Level Security policies.

### 4. Configure Supabase Edge Function Secrets

The following secrets are automatically configured for Edge Functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WHATSAPP_PROVIDER_API_KEY`
- `WHATSAPP_PROVIDER_API_SECRET`
- `WHATSAPP_PHONE_NUMBER_ID`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `DELHIVERY_API_KEY`
- `DELHIVERY_SECRET`
- `DELHIVERY_WEBHOOK_SECRET`
- `DEFAULT_PACKAGING_WEIGHT_GRAMS` (default: 50)
- `VOL_METRIC_DEFAULT_DIVISOR` (default: 5000)
- `APP_BASE_URL`
- `NODE_ENV`

### 5. Create Admin User

After deployment, create an admin user via Supabase Dashboard:

1. Go to Authentication > Users
2. Add a new user with email/password
3. Go to Table Editor > profiles
4. Insert a profile record:
   ```sql
   INSERT INTO profiles (id, full_name, role)
   VALUES ('user-uuid-from-auth', 'Admin Name', 'admin');
   ```

### 6. Run Development Server

```bash
npm run dev
```

The admin panel will be available at `http://localhost:5173`

### 7. Build for Production

```bash
npm run build
```

## API Endpoints

All Edge Functions are deployed at: `https://your-project.supabase.co/functions/v1/`

### Public Endpoints (Webhooks)

#### WhatsApp Webhook
```
POST /whatsapp-webhook
```
Configure this URL in your WhatsApp Business API provider.

#### Razorpay Webhook
```
POST /razorpay-webhook
Headers:
  x-razorpay-signature: <signature>
```
Configure in Razorpay Dashboard > Settings > Webhooks

#### Delhivery Webhook
```
POST /delhivery-webhook
```
Configure in Delhivery API settings.

### Authenticated Endpoints

#### Create Order
```
POST /create-order
Authorization: Bearer <service_role_key>
Body:
{
  "school_code": "1234",
  "class_id": 1,
  "category": "books",
  "items": [{"item_id": 1, "qty": 2}],
  "delivery_type": "school",
  "parent_phone": "919999999999",
  "parent_name": "John Doe",
  "address": "Optional for home delivery"
}
```

#### Compute Weights
```
POST /compute-weights
Authorization: Bearer <service_role_key>
Body:
{
  "order_id": 123
}
```

#### Create Shipment
```
POST /create-shipment
Authorization: Bearer <service_role_key>
Body:
{
  "order_id": 123
}
```

## Weight Calculation Formula

### Actual Weight
```
actual_weight = sum(item.weight_grams × qty) + (packaging_weight × package_count)
```

### Volumetric Weight
```
volumetric_kg = (length_cm × width_cm × height_cm) / volumetric_divisor
volumetric_grams = volumetric_kg × 1000
```

### Billed Weight
```
billed_weight = max(actual_weight, volumetric_grams)
billed_weight = ceil(billed_weight / rounding_grams) × rounding_grams
```

**Example:**
- Item: 200g, 20×15×2 cm, qty=2
- Packaging: 50g
- Actual: (200×2) + 50 = 450g
- Volumetric: (20×15×2) / 5000 = 0.12kg = 120g
- Billed: max(450, 120) = 450g
- Rounded (500g): 500g

## WhatsApp Message Templates

Configure these templates in your WhatsApp Business API provider:

1. **school_code_invalid**: Invalid school code message
2. **school_code_accepted**: Code accepted with class list
3. **choose_books_or_stationery**: Category selection
4. **choose_delivery**: Delivery type selection
5. **request_address**: Home address request
6. **payment_link**: Payment link with amount
7. **payment_confirmed**: Payment confirmation
8. **order_update**: Status update with tracking
9. **awb_generated**: Shipment created notification

## Deployment

### Deploy to Production

1. Deploy frontend to hosting service (Vercel, Netlify, etc.)
2. Edge Functions are already deployed to Supabase
3. Configure webhook URLs in external services:
   - Razorpay webhook URL
   - Delhivery webhook URL
   - WhatsApp webhook URL

### Testing

#### Weight Calculation Test
```bash
curl -X POST https://your-project.supabase.co/functions/v1/compute-weights \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"order_id": 1}'
```

#### Create Order Test
```bash
curl -X POST https://your-project.supabase.co/functions/v1/create-order \
  -H "Authorization: Bearer YOUR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "school_code": "1234",
    "class_id": 1,
    "category": "books",
    "items": [{"item_id": 1, "qty": 2}],
    "delivery_type": "school",
    "parent_phone": "919999999999"
  }'
```

## Architecture

```
┌─────────────┐
│   Parents   │
│  (WhatsApp) │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│  WhatsApp Provider API  │
│  (Twilio/Gupshup/Meta) │
└───────────┬─────────────┘
            │
            ▼
┌──────────────────────────┐
│  Supabase Edge Function  │
│   whatsapp-webhook       │
└───────────┬──────────────┘
            │
            ▼
┌──────────────────────────┐
│  Conversation State      │
│  Management & Routing    │
└───────────┬──────────────┘
            │
            ▼
┌──────────────────────────┐
│  Edge Function:          │
│  create-order            │
└───────────┬──────────────┘
            │
            ▼
┌──────────────────────────┐
│  Razorpay Payment Link   │
└───────────┬──────────────┘
            │
            ▼
┌──────────────────────────┐
│  Edge Function:          │
│  razorpay-webhook        │
└───────────┬──────────────┘
            │
            ▼
┌──────────────────────────┐
│  Admin Panel             │
│  (Order Processing)      │
└───────────┬──────────────┘
            │
            ▼
┌──────────────────────────┐
│  Edge Function:          │
│  create-shipment         │
└───────────┬──────────────┘
            │
            ▼
┌──────────────────────────┐
│  Delhivery API           │
└───────────┬──────────────┘
            │
            ▼
┌──────────────────────────┐
│  Edge Function:          │
│  delhivery-webhook       │
└───────────┬──────────────┘
            │
            ▼
┌──────────────────────────┐
│  WhatsApp Notifications  │
└──────────────────────────┘
```

## Security

- All API keys stored as Supabase secrets (never in frontend)
- Row Level Security (RLS) enabled on all tables
- Webhook signature verification for Razorpay and Delhivery
- JWT verification for authenticated endpoints
- Admin/Team role-based access control

## Support

For issues or questions:
1. Check the Edge Function logs in Supabase Dashboard
2. Review database logs for RLS policy violations
3. Verify webhook configurations in external services
4. Check WhatsApp message logs in `whatsapp_messages` table

## License

Proprietary - All rights reserved
# WhatsApp-Book-Delivery
