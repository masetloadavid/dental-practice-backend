-- =============================================================================
-- SmileCare Dental Practice — PostgreSQL Schema
-- =============================================================================
-- HOW TO RUN THIS FILE:
--   Option A (Railway Shell):
--     1. Go to your PostgreSQL service on Railway
--     2. Click "Connect" → open the Query tab
--     3. Paste this entire file and click Run
--
--   Option B (psql on your machine):
--     psql "$DATABASE_URL" -f schema.sql
--
--   Option C (automatic on startup):
--     The server.js file runs this automatically on first start if the
--     tables do not yet exist.
-- =============================================================================


-- ── PATIENTS TABLE ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id               SERIAL PRIMARY KEY,
  full_name        VARCHAR(255)        NOT NULL,
  phone            VARCHAR(50)         NOT NULL,
  email            VARCHAR(255),
  date_of_birth    DATE,
  notes            TEXT,
  whatsapp_opt_in  BOOLEAN             NOT NULL DEFAULT false,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for fast phone lookups (useful when matching incoming WhatsApp replies)
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients (phone);


-- ── APPOINTMENTS TABLE ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id                SERIAL PRIMARY KEY,
  patient_id        INTEGER             NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_date  DATE                NOT NULL,
  appointment_time  TIME                NOT NULL,
  appointment_type  VARCHAR(100)        NOT NULL DEFAULT 'Check-up & Clean',
  duration_minutes  INTEGER             NOT NULL DEFAULT 60,
  status            VARCHAR(20)         NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  notes             TEXT,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date       ON appointments (appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status     ON appointments (status);


-- ── REMINDERS TABLE ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminders (
  id              SERIAL PRIMARY KEY,
  appointment_id  INTEGER             REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id      INTEGER             NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  reminder_type   VARCHAR(30)         NOT NULL
                    CHECK (reminder_type IN (
                      'six_month_recall',
                      'one_week_before',
                      'one_day_before',
                      'day_of'
                    )),
  scheduled_for   DATE                NOT NULL,
  sent            BOOLEAN             NOT NULL DEFAULT false,
  sent_at         TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_appointment_id ON reminders (appointment_id);
CREATE INDEX IF NOT EXISTS idx_reminders_patient_id     ON reminders (patient_id);
-- This index makes the daily reminder check very fast
CREATE INDEX IF NOT EXISTS idx_reminders_due            ON reminders (scheduled_for, sent);
