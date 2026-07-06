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
const https = require('https');
// const { initSchema } = require('./db');

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

app.post('/api/reviews/negative', async (req, res) => {
  try {
    const { patientName, phone, rating, feedback } = req.body;

const response = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    "accept": "application/json",
    "api-key": process.env.BREVO_API_KEY,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    sender: {
      name: "Love2Smile Dental Suites",
      email: process.env.SMTP_USER
    },
    to: [
      {
        email: process.env.CLINICAL_EMAIL
      }
    ],
    subject: "Negative Patient Review Alert",
textContent: `
🚨 Negative Review Alert — Love2Smile Dental Suites

Patient: ${patientName || 'Unknown'}
Phone: ${phone || 'No phone provided'}
Date: ${new Date().toLocaleString('en-ZA')}

Rating:
${rating || 'Not provided'}

Feedback:
${feedback || 'Patient selected negative review'}

Action Required:
Please follow up with this patient as soon as possible.
`
  })
});

const result = await response.json();
console.log("Brevo response:", result);

if (!response.ok) {
  throw new Error(JSON.stringify(result));
}

res.json({
  success: true,
  message: "Email sent successfully"
});

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/reviews/send-request', async (req, res) => {
  try {
    const { patientName, patientEmail, patientPhone } = req.body;

    if (!patientEmail) {
      return res.status(400).json({ error: 'Patient email required' });
    }

    const reviewLink =
  `https://dental-practice-frontend-production.up.railway.app/review?name=${encodeURIComponent(patientName)}&phone=${encodeURIComponent(patientPhone)}`;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: {
          name: "Love2Smile Dental Suites",
          email: process.env.SMTP_USER
        },
        to: [
          {
            email: patientEmail
          }
        ],
        subject: "How was your visit at Love2Smile?",
        htmlContent: `
          <h2>Hello ${patientName || "Patient"} 👋</h2>
          <p>Thank you for visiting Love2Smile Dental Suites.</p>
          <p>Please click the button below to leave a quick review.</p>
          <a href="${reviewLink}"
             style="background:#2563eb;color:white;padding:12px 20px;text-decoration:none;border-radius:8px;">
             Leave Review
          </a>
        `
      })
    });

    const result = await response.json();
    console.log(result);

    if (!response.ok) {
      throw new Error(JSON.stringify(result));
    }

    res.json({
      success: true,
      message: "Review request sent"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send review request" });
  }
});

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

async function start() {
  console.log('Starting server without schema check');

  app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('SmileCare Dental Backend is running!');
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log('=================================');
});
}

start();
