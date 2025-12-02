# Stripe Webhook Server

A Node.js server that receives and stores Stripe webhook events in a PostgreSQL database.

## Features

- ✅ Receives Stripe webhook events
- ✅ Verifies webhook signatures for security
- ✅ Stores all events in PostgreSQL database
- ✅ Handles duplicate events (idempotent)
- ✅ REST API to query stored events
- ✅ Automatic database table creation
- ✅ Graceful shutdown handling

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create a `.env` file:**
   ```env
   DATABASE_URL=postgresql://neondb_owner:*****@ep-holy-silence-a8gloijt-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require
   STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
   PORT=3000
   ```

3. **Start the server:**
   ```bash
   npm start
   ```
   
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

## Database Schema

The server automatically creates a `stripe_webhook_events` table with the following structure:

- `id` - Auto-incrementing primary key
- `event_id` - Unique Stripe event ID
- `event_type` - Type of event (e.g., `payment_intent.succeeded`)
- `event_data` - Full event payload stored as JSONB
- `created_at` - Timestamp when event was received
- `processed_at` - Timestamp when event was processed

## API Endpoints

### `POST /webhook`
Stripe webhook endpoint. Receives and stores all Stripe events.

### `GET /health`
Health check endpoint. Returns server and database connection status.

### `GET /events`
Get all stored webhook events.

**Query Parameters:**
- `limit` - Number of events to return (default: 50)
- `offset` - Pagination offset (default: 0)
- `type` - Filter by event type (e.g., `?type=payment_intent.succeeded`)

**Example:**
```bash
curl http://localhost:3000/events?limit=10&type=payment_intent.succeeded
```

### `GET /events/:eventId`
Get a specific event by Stripe event ID.

**Example:**
```bash
curl http://localhost:3000/events/evt_1234567890
```

## Stripe Webhook Configuration

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → Developers → Webhooks
2. Click "Add endpoint"
3. Enter your webhook URL: `https://your-domain.com/webhook`
4. Select the events you want to listen to:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `customer.created`
   - `customer.updated`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `subscription.created`
   - `subscription.updated`
   - `subscription.deleted`
   - Or select "All events" to receive everything
5. Copy the "Signing secret" and add it to your `.env` file as `STRIPE_WEBHOOK_SECRET`

## Stored Event Types

The server stores all Stripe webhook events, including but not limited to:

- Payment Intent events (succeeded, failed)
- Customer events (created, updated, deleted)
- Invoice events (payment succeeded, payment failed)
- Subscription events (created, updated, deleted)
- And any other events you configure in Stripe

## Development

The server uses:
- **Express** - Web framework
- **Stripe** - Stripe SDK for webhook verification
- **pg** - PostgreSQL client
- **dotenv** - Environment variable management

## Notes

- Events are stored with duplicate prevention (using unique `event_id`)
- All event data is stored as JSONB for flexible querying
- The server handles graceful shutdown and closes database connections properly
- Webhook signature verification ensures events are authentic

