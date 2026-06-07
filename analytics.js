// =============================================================================
// routes/analytics.js — Practice dashboard metrics
// =============================================================================

const express = require('express');
const router  = express.Router();
const { pool } = require('./db');

// ── GET /api/analytics ────────────────────────────────────────────────────────
// Returns all key metrics in a single request so the dashboard
// only needs to make one API call.
router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"

    // Run all queries in parallel for speed
    const [
      totalPatients,
      todayAppointments,
      monthlyAppointments,
      whatsappOptIns,
      recallsDue,
      appointmentsByStatus,
      appointmentsByType,
    ] = await Promise.all([

      // 1. Total patient count
      pool.query('SELECT COUNT(*) AS count FROM patients'),

      // 2. Today's appointments (with patient names)
      pool.query(
        `SELECT a.*, p.full_name AS patient_name, p.phone
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         WHERE a.appointment_date = $1
         ORDER BY a.appointment_time ASC`,
        [today]
      ),

      // 3. Appointment counts grouped by month for the last 6 months
      pool.query(
        `SELECT
           TO_CHAR(appointment_date, 'Mon YYYY') AS month,
           TO_CHAR(appointment_date, 'YYYY-MM')  AS month_key,
           COUNT(*)                               AS count
         FROM appointments
         WHERE appointment_date >= NOW() - INTERVAL '6 months'
         GROUP BY month_key, month
         ORDER BY month_key ASC`
      ),

      // 4. WhatsApp opt-in count
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE whatsapp_opt_in = true)  AS opted_in,
           COUNT(*) FILTER (WHERE whatsapp_opt_in = false) AS opted_out,
           COUNT(*)                                         AS total
         FROM patients`
      ),

      // 5. Recalls due: patients whose last completed appointment was 170+ days
      //    ago (i.e. recall is coming up in the next 10 days or overdue)
      pool.query(
        `SELECT
           p.id,
           p.full_name,
           p.phone,
           p.whatsapp_opt_in,
           MAX(a.appointment_date) AS last_visit
         FROM patients p
         LEFT JOIN appointments a
           ON a.patient_id = p.id AND a.status = 'completed'
         GROUP BY p.id, p.full_name, p.phone, p.whatsapp_opt_in
         HAVING
           MAX(a.appointment_date) < NOW() - INTERVAL '170 days'
           OR MAX(a.appointment_date) IS NULL
         ORDER BY last_visit ASC NULLS FIRST`
      ),

      // 6. Appointment counts broken down by status
      pool.query(
        `SELECT status, COUNT(*) AS count
         FROM appointments
         GROUP BY status`
      ),

      // 7. Appointment counts by type (top 8)
      pool.query(
        `SELECT appointment_type AS type, COUNT(*) AS count
         FROM appointments
         GROUP BY appointment_type
         ORDER BY count DESC
         LIMIT 8`
      ),
    ]);

    // Shape the response so the React frontend can consume it directly
    res.json({
      total_patients:        parseInt(totalPatients.rows[0].count, 10),
      todays_appointments:   todayAppointments.rows,
      todays_count:          todayAppointments.rows.length,
      monthly_appointments:  monthlyAppointments.rows.map(row => ({
        month: row.month,
        count: parseInt(row.count, 10),
      })),
      whatsapp: {
        opted_in:  parseInt(whatsappOptIns.rows[0].opted_in,  10),
        opted_out: parseInt(whatsappOptIns.rows[0].opted_out, 10),
        total:     parseInt(whatsappOptIns.rows[0].total,     10),
      },
      recalls_due:          recallsDue.rows,
      recalls_count:        recallsDue.rows.length,
      appointments_by_status: appointmentsByStatus.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count, 10);
        return acc;
      }, {}),
      appointments_by_type: appointmentsByType.rows.map(row => ({
        type:  row.type,
        count: parseInt(row.count, 10),
      })),
    });

  } catch (err) {
    console.error('GET /api/analytics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch analytics.' });
  }
});

module.exports = router;
