// =============================================================================
// db.js — PostgreSQL connection pool
// =============================================================================
// This file creates ONE shared connection pool that is reused by every route.
// It reads the DATABASE_URL from your .env file (locally) or from Railway's
// environment variables (in production).
// =============================================================================

const { Pool } = require('pg');
const fs        = require('fs');
const path      = require('path');

// ── CREATE THE CONNECTION POOL ────────────────────────────────────────────────
// pg automatically reads DATABASE_URL from process.env.
// On Railway, this is injected for you when you link the PostgreSQL service.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Railway PostgreSQL requires SSL in production.
  // rejectUnauthorized: false tells pg to accept Railway's self-signed cert.
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// ── TEST THE CONNECTION ON STARTUP ────────────────────────────────────────────
// pool.connect((err, client, release) => {
//  if (err) {
 //   console.error('❌ Could not connect to PostgreSQL:', err.message);
  //  console.error('   Make sure DATABASE_URL is set correctly in your .env file.');
  //  return;
//  }
//  console.log('✅ Connected to PostgreSQL database.');
//  release(); // return the client back to the pool
// });

// ── AUTO-CREATE TABLES ON FIRST RUN ──────────────────────────────────────────
// Reads schema.sql and runs it if the tables do not exist yet.
// This means you do NOT need to manually run schema.sql on Railway —
// just deploy and the tables are created automatically.
async function initSchema() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql        = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    console.log('✅ Database schema is up to date.');
  } catch (err) {
    console.error('❌ Error running schema.sql:', err.message);
  }
}

// Export both the pool (for queries) and initSchema (called from server.js)
module.exports = { pool, initSchema };
