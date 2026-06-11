// =============================================================================
// server.js — Love2Smile Dental Suites Practice Backend
// =============================================================================
// Entry point for the Express API server.
//
// TO RUN LOCALLY:
//   1. Copy .env.example to .env and fill in your values
//   2. npm install
//   3. npm run dev        (uses nodemon — auto-restarts on file changes)
//      OR
//      npm start          (plain node — use this on Railway)
//
// TO DEPLOY ON RAILWAY:
//   See README.md for the full step-by-step guide.
// =============================================================================

// Load environment variables from .env (only needed locally;
// Railway injects them automatically in production).
require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const { initSchema } = require('./db');

// ── CREATE THE EXPRESS APP ────────────────────────────────────────────────────
const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
// This tells the browser that only your React frontend is allowed to
// call this API. Requests from any other origin will be blocked.
//
// ALLOWED_ORIGINS can be a comma-separated list in your .env if you need
// to allow multiple domains (e.g. local dev + production frontend).
const ALLOWED_ORIGINS = [
  'https://dental-practice-frontend-production.up.railway.app', // ← your Railway frontend
  'http://localhost:3000',  // local React dev server (Create React App)
  'http://localhost:5173',  // local React dev server (Vite)
];

// If FRONTEND_URL is set in .env, add it to the allowed list too
if (process.env.FRONTEND_URL && !ALLOWED_ORIGINS.includes(process.env.FRONTEND_URL)) {
  ALLOWED_ORIGINS.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. Postman, curl, Railway health checks)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from: ${origin}`);
      callback(new Error(`CORS policy: origin ${origin} is not allowed.`));
    }
  },
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ── BODY PARSER ───────────────────────────────────────────────────────────────
// Lets Express read JSON request bodies (e.g. POST /api/patients)
app.use(express.json());

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
// Railway pings this to know the service is alive. Do not remove it.
app.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    service:   'SmileCare Dental Backend',
  });
});

// ── ROOT ──────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'SmileCare Dental Practice API',
    version: '1.0.0',
    endpoints: {
      patients:     '/api/patients',
      appointments: '/api/appointments',
      reminders:    '/api/reminders',
      analytics:    '/api/analytics',
      health:       '/health',
    },
  });
});

// ── API ROUTES ────────────────────────────────────────────────────────────────
app.use('/api/patients', require('./patients'));
app.use('/api/appointments', require('./appointments'));
app.use('/api/reminders', require('./reminders'));
app.use('/api/analytics', require('./analytics'));

// ── 404 HANDLER ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ── GLOBAL ERROR HANDLER ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

// ── START SERVER ──────────────────────────────────────────────────────────────
// Railway injects PORT automatically. We fall back to 3001 for local dev.
const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('SmileCare Dental Backend is running!');
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log('=================================');
});

initSchema()
  .then(() => {
    console.log('✅ Database schema is up to date.');
  })
  .catch((err) => {
    console.error('❌ Database schema error:', err.message);
  });
