// =============================================================================
// routes/patients.js — CRUD endpoints for the patients table
// =============================================================================

const express = require('express');
const router  = express.Router();
const { pool } = require('./db');

// ── GET /api/patients ─────────────────────────────────────────────────────────
// Returns all patients, newest first.
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM patients ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/patients error:', err.message);
    res.status(500).json({ error: 'Failed to fetch patients.' });
  }
});

// ── GET /api/patients/:id ─────────────────────────────────────────────────────
// Returns a single patient by ID.
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM patients WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /api/patients/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch patient.' });
  }
});

// ── POST /api/patients ────────────────────────────────────────────────────────
// Creates a new patient record.
// Body: { full_name, phone, email?, date_of_birth?, notes?, whatsapp_opt_in? }
router.post('/', async (req, res) => {
  const {
    full_name,
    phone,
    email          = null,
    date_of_birth  = null,
    notes          = null,
    whatsapp_opt_in = false,
  } = req.body;

  // Basic validation
  if (!full_name || !phone) {
    return res.status(400).json({ error: 'full_name and phone are required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO patients (full_name, phone, email, date_of_birth, notes, whatsapp_opt_in)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [full_name, phone, email, date_of_birth, notes, whatsapp_opt_in]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/patients error:', err.message);
    res.status(500).json({ error: 'Failed to create patient.' });
  }
});

// ── PUT /api/patients/:id ─────────────────────────────────────────────────────
// Updates an existing patient.
// Body: any subset of patient fields to update.
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    full_name,
    phone,
    email,
    date_of_birth,
    notes,
    whatsapp_opt_in,
  } = req.body;

  try {
    // Build update query dynamically — only update the fields that were sent
    const fields  = [];
    const values  = [];
    let   counter = 1;

    if (full_name       !== undefined) { fields.push(`full_name = $${counter++}`);        values.push(full_name); }
    if (phone           !== undefined) { fields.push(`phone = $${counter++}`);             values.push(phone); }
    if (email           !== undefined) { fields.push(`email = $${counter++}`);             values.push(email); }
    if (date_of_birth   !== undefined) { fields.push(`date_of_birth = $${counter++}`);     values.push(date_of_birth); }
    if (notes           !== undefined) { fields.push(`notes = $${counter++}`);             values.push(notes); }
    if (whatsapp_opt_in !== undefined) { fields.push(`whatsapp_opt_in = $${counter++}`);   values.push(whatsapp_opt_in); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields provided to update.' });
    }

    values.push(id); // last placeholder = WHERE id = $N
    const result = await pool.query(
      `UPDATE patients SET ${fields.join(', ')} WHERE id = $${counter} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /api/patients/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update patient.' });
  }
});

// ── DELETE /api/patients/:id ──────────────────────────────────────────────────
// Deletes a patient (and their appointments + reminders via CASCADE).
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM patients WHERE id = $1 RETURNING id, full_name',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found.' });
    }
    res.json({ message: `Patient "${result.rows[0].full_name}" deleted.` });
  } catch (err) {
    console.error('DELETE /api/patients/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete patient.' });
  }
});

module.exports = router;
