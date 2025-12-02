const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize database table
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(255) UNIQUE NOT NULL,
        event_type VARCHAR(255) NOT NULL,
        event_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      )
    `);
    
    // Create index on event_type for faster queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_event_type ON stripe_webhook_events(event_type)
    `);
    
    // Create index on created_at for time-based queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_created_at ON stripe_webhook_events(created_at)
    `);
    
    console.log('✅ Database table initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
}

// Middleware to parse raw body for webhook signature verification
// Stripe requires the raw body, not the parsed JSON
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Store webhook event in database
async function storeWebhookEvent(event) {
  try {
    const result = await pool.query(
      `INSERT INTO stripe_webhook_events (event_id, event_type, event_data, processed_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id`,
      [event.id, event.type, JSON.stringify(event)]
    );
    
    if (result.rows.length > 0) {
      console.log(`✅ Stored event ${event.id} (${event.type}) in database`);
      return result.rows[0].id;
    } else {
      console.log(`⚠️  Event ${event.id} already exists in database (duplicate)`);
      return null;
    }
  } catch (error) {
    console.error('❌ Error storing webhook event:', error);
    throw error;
  }
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    // Verify the webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Store event in database first
  try {
    await storeWebhookEvent(event);
  } catch (dbError) {
    console.error('Failed to store event in database:', dbError);
    // Continue processing even if DB storage fails
  }

  // Handle the event
  console.log(`Received event: ${event.type}`);

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('PaymentIntent succeeded:', paymentIntent.id);
      // Handle successful payment
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('PaymentIntent failed:', failedPayment.id);
      // Handle failed payment
      break;

    case 'customer.created':
      const customer = event.data.object;
      console.log('Customer created:', customer.id);
      // Handle customer creation
      break;

    case 'customer.updated':
      const updatedCustomer = event.data.object;
      console.log('Customer updated:', updatedCustomer.id);
      // Handle customer update
      break;

    case 'invoice.payment_succeeded':
      const invoice = event.data.object;
      console.log('Invoice payment succeeded:', invoice.id);
      // Handle successful invoice payment
      break;

    case 'invoice.payment_failed':
      const failedInvoice = event.data.object;
      console.log('Invoice payment failed:', failedInvoice.id);
      // Handle failed invoice payment
      break;

    case 'subscription.created':
      const subscription = event.data.object;
      console.log('Subscription created:', subscription.id);
      // Handle subscription creation
      break;

    case 'subscription.updated':
      const updatedSubscription = event.data.object;
      console.log('Subscription updated:', updatedSubscription.id);
      // Handle subscription update
      break;

    case 'subscription.deleted':
      const deletedSubscription = event.data.object;
      console.log('Subscription deleted:', deletedSubscription.id);
      // Handle subscription deletion
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Return a response to acknowledge receipt of the event
  res.json({ received: true, eventId: event.id, eventType: event.type });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      message: 'Stripe webhook server is running',
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Get all webhook events endpoint
app.get('/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const eventType = req.query.type;

    let query = 'SELECT * FROM stripe_webhook_events';
    const params = [];
    
    if (eventType) {
      query += ' WHERE event_type = $1';
      params.push(eventType);
      query += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';
      params.push(limit, offset);
    } else {
      query += ' ORDER BY created_at DESC LIMIT $1 OFFSET $2';
      params.push(limit, offset);
    }

    const result = await pool.query(query, params);
    res.json({
      events: result.rows,
      count: result.rows.length,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events', message: error.message });
  }
});

// Get event by ID endpoint
app.get('/events/:eventId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM stripe_webhook_events WHERE event_id = $1',
      [req.params.eventId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: 'Failed to fetch event', message: error.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Stripe Webhook Server',
    endpoints: {
      webhook: 'POST /webhook',
      health: 'GET /health',
      events: 'GET /events?limit=50&offset=0&type=optional',
      eventById: 'GET /events/:eventId'
    }
  });
});

// Start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    
    // Start listening
    app.listen(PORT, () => {
      console.log(`Stripe webhook server is running on port ${PORT}`);
      console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
      console.log(`Events API: http://localhost:${PORT}/events`);
      if (!WEBHOOK_SECRET) {
        console.warn('⚠️  WARNING: STRIPE_WEBHOOK_SECRET is not set. Webhook verification will fail.');
      }
      if (!process.env.STRIPE_SECRET_KEY) {
        console.warn('⚠️  WARNING: STRIPE_SECRET_KEY is not set.');
      }
      if (!process.env.DATABASE_URL) {
        console.warn('⚠️  WARNING: DATABASE_URL is not set.');
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server and database connection');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server and database connection');
  await pool.end();
  process.exit(0);
});

startServer();

