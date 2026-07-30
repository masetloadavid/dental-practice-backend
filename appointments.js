// =============================================================================
// routes/appointments.js — CRUD endpoints for the appointments table
// =============================================================================

const express = require('express');
const router  = express.Router();
const { pool } = require('./db');

// ── GET /api/appointments ─────────────────────────────────────────────────────
// Returns all appointments joined with patient name.
// Optional query param: ?date=YYYY-MM-DD  →  filter by a specific date
// Optional query param: ?status=confirmed  →  filter by status
router.get('/', async (req, res) => {
  const { date, status } = req.query;

  try {
    const conditions = [];
    const values     = [];
    let   counter    = 1;

    if (date)   { conditions.push(`a.appointment_date = $${counter++}`); values.push(date); }
    if (status) { conditions.push(`a.status = $${counter++}`);           values.push(status); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         a.*,
         p.full_name   AS patient_name,
         p.phone       AS patient_phone,
         p.whatsapp_opt_in
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       ${whereClause}
       ORDER BY a.appointment_date ASC, a.appointment_time ASC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/appointments error:', err.message);
    res.status(500).json({ error: 'Failed to fetch appointments.' });
  }
});

// ── GET /api/appointments/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT a.*, p.full_name AS patient_name, p.phone AS patient_phone
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       WHERE a.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /api/appointments/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch appointment.' });
  }
});

// — POST /api/appointments/book-online
router.post('/book-online', async (req, res) => {
  const {
  full_name,
  phone,
  email = '',
  date_of_birth = '',
  appointment_date,
  appointment_time,
  payment_type = 'Cash',
  medical_aid_name = '',
  membership_number = '',
  beneficiary_type = '',
  appointment_type = 'Check-up & Clean'
} = req.body;

  try {
    // 1. Create patient
    // 1. Check if patient already exists
let patient_id;

const existingPatient = await pool.query(
  `SELECT id FROM patients
   WHERE (phone = $1 OR email = $2)
   AND full_name = $3
   LIMIT 1`,
  [phone, email, full_name]
);

if (existingPatient.rows.length > 0) {
  patient_id = existingPatient.rows[0].id;
} else {
  const patientResult = await pool.query(
    `INSERT INTO patients (full_name, phone, email, date_of_birth, whatsapp_opt_in)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id`,
    [full_name, phone, email, date_of_birth]
  );

  patient_id = patientResult.rows[0].id;
}

    // 2. Create appointment
    const appointmentResult = await pool.query(
  `INSERT INTO appointments
  (patient_id, appointment_date, appointment_time, appointment_type, status, payment_type, medical_aid_name, membership_number, beneficiary_type)
  VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, $7, $8)
  RETURNING id`,
  [
    patient_id,
    appointment_date,
    appointment_time,
    appointment_type,
    payment_type,
    medical_aid_name,
    membership_number,
    beneficiary_type
  ]
);

    const appointment_id = appointmentResult.rows[0].id;

    // 3. Create reminders
    // Create reminder timestamps

const oneWeekReminder = `${appointment_date} 07:00:00`;
const oneDayReminder = new Date(appointment_date);
oneDayReminder.setDate(oneDayReminder.getDate() - 1);

const oneDayReminderString =
    oneDayReminder.toISOString().split("T")[0] + " 07:00:00";

const dayOfReminder = `${appointment_date} 07:00:00`;

await pool.query(`
INSERT INTO reminders
(appointment_id, reminder_type, scheduled_for)
VALUES
($1,'one_week_before',$2),
($1,'one_day_before',$3),
($1,'day_of',$4)
`,
[
    appointment_id,
    oneWeekReminder,
    oneDayReminderString,
    dayOfReminder
]);

    res.json({
      success: true,
      patient_id,
      appointment_id
    });

  } catch (err) {
    console.error('Online booking error:', err.message);
    res.status(500).json({ error: 'Failed to create online booking' });
  }
});

// ── POST /api/appointments ────────────────────────────────────────────────────
// Creates a new appointment and automatically schedules the three reminder rows.
// Body: { patient_id, appointment_date, appointment_time, appointment_type?,
//         duration_minutes?, status?, notes? }
router.post('/', async (req, res) => {
  const {
    patient_id,
    appointment_date,
    appointment_time,
    appointment_type   = 'Check-up & Clean',
    duration_minutes   = 60,
    status             = 'pending',
    notes              = null,
  } = req.body;

  if (!patient_id || !appointment_date || !appointment_time) {
    return res.status(400).json({
      error: 'patient_id, appointment_date, and appointment_time are required.'
    });
  }

  // Use a transaction so the appointment and reminder rows are always created together
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert the appointment
    const apptResult = await client.query(
      `INSERT INTO appointments
         (patient_id, appointment_date, appointment_time, appointment_type,
          duration_minutes, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [patient_id, appointment_date, appointment_time, appointment_type,
       duration_minutes, status, notes]
    );
    const appt = apptResult.rows[0];

    // 2. Auto-schedule the three appointment reminders
    //    (six_month_recall is triggered separately by the reminder engine)
    const apptDate   = new Date(appointment_date);
    const weekBefore = new Date(apptDate); weekBefore.setDate(apptDate.getDate() - 7);
    const dayBefore  = new Date(apptDate); dayBefore.setDate(apptDate.getDate() - 1);
    const dayOf      = new Date(apptDate);

    const toISO = (d) => d.toISOString().split('T')[0];

    const reminderRows = [
      [appt.id, patient_id, 'one_week_before', toISO(weekBefore)],
      [appt.id, patient_id, 'one_day_before',  toISO(dayBefore)],
      [appt.id, patient_id, 'day_of',          toISO(dayOf)],
    ];

    for (const [apptId, patId, type, scheduledFor] of reminderRows) {
      await client.query(
        `INSERT INTO reminders (appointment_id, patient_id, reminder_type, scheduled_for)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [apptId, patId, type, scheduledFor]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      ...appt,
      reminders_scheduled: reminderRows.map(r => ({ type: r[2], scheduled_for: r[3] })),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/appointments error:', err.message);
    res.status(500).json({ error: 'Failed to create appointment.' });
  } finally {
    client.release();
  }
});

// ── PUT /api/appointments/:id ─────────────────────────────────────────────────
// Updates an appointment. Commonly used to change status.
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    appointment_date,
    appointment_time,
    appointment_type,
    duration_minutes,
    status,
    notes,
  } = req.body;

  try {
    const fields  = [];
    const values  = [];
    let   counter = 1;

    if (appointment_date !== undefined) { fields.push(`appointment_date = $${counter++}`);  values.push(appointment_date); }
    if (appointment_time !== undefined) { fields.push(`appointment_time = $${counter++}`);  values.push(appointment_time); }
    if (appointment_type !== undefined) { fields.push(`appointment_type = $${counter++}`);  values.push(appointment_type); }
    if (duration_minutes !== undefined) { fields.push(`duration_minutes = $${counter++}`);  values.push(duration_minutes); }
    if (status           !== undefined) { fields.push(`status = $${counter++}`);            values.push(status); }
    if (notes            !== undefined) { fields.push(`notes = $${counter++}`);             values.push(notes); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields provided to update.' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE appointments SET ${fields.join(', ')} WHERE id = $${counter} RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }
if (status === "completed") {

const appointment = await pool.query(
`
SELECT
a.id,
p.id AS patient_id,
p.email
FROM appointments a
JOIN patients p
ON a.patient_id = p.id
WHERE a.id = $1
`,
[id]
);

}
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /api/appointments/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update appointment.' });
  }
});

// ── DELETE /api/appointments/:id ──────────────────────────────────────────────
// Deletes an appointment (and its reminders via CASCADE).
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM appointments WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }
    res.json({ message: `Appointment ${id} deleted.` });
  } catch (err) {
    console.error('DELETE /api/appointments/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete appointment.' });
  }
});

module.exports = router;
