
// =============================================================================
// routes/analytics.js — Practice dashboard metrics
// =============================================================================

const express = require('express');
const router = express.Router();
const { pool } = require('./db');
const {
  authenticateToken,
  requireStaff
} = require('../authMiddleware');

// ── GET /api/analytics ────────────────────────────────────────────────────────

router.get('/', authenticateToken, requireStaff, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Managers can see all surgeries.
    // Receptionists can only see their assigned surgery.
    const isManager = req.user.role === 'MANAGER';
    const branch = isManager ? null : req.user.branch;

    if (!isManager && !branch) {
      return res.status(403).json({
        success: false,
        error: 'Your account has no assigned surgery.'
      });
    }

    const [
      totalPatients,
      todayAppointments,
      monthlyAppointments,
      whatsappOptIns,
      recallsDue,
      appointmentsByStatus,
      appointmentsByType,
      appointmentsByDentist,
      branchStats
    ] = await Promise.all([

      // 1. Patients associated with the surgery
      pool.query(
        `SELECT COUNT(DISTINCT p.id) AS count
         FROM patients p
         JOIN appointments a ON a.patient_id = p.id
         WHERE ($1::text IS NULL OR a.branch = $1)`,
        [branch]
      ),

      // 2. Today's appointments
      pool.query(
        `SELECT a.*, p.full_name AS patient_name, p.phone
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         WHERE a.appointment_date = $1
         AND ($2::text IS NULL OR a.branch = $2)
         ORDER BY a.appointment_time ASC`,
        [today, branch]
      ),

      // 3. Monthly appointments — last six months
      pool.query(
        `SELECT
           TO_CHAR(appointment_date, 'Mon YYYY') AS month,
           TO_CHAR(appointment_date, 'YYYY-MM') AS month_key,
           COUNT(*) AS count
         FROM appointments
         WHERE appointment_date >= NOW() - INTERVAL '6 months'
         AND ($1::text IS NULL OR branch = $1)
         GROUP BY month_key, month
         ORDER BY month_key ASC`,
        [branch]
      ),

      // 4. WhatsApp opt-in statistics
      pool.query(
        `SELECT
           COUNT(DISTINCT p.id) FILTER (
             WHERE p.whatsapp_opt_in = true
           ) AS opted_in,
           COUNT(DISTINCT p.id) FILTER (
             WHERE p.whatsapp_opt_in = false
           ) AS opted_out,
           COUNT(DISTINCT p.id) AS total
         FROM patients p
         JOIN appointments a ON a.patient_id = p.id
         WHERE ($1::text IS NULL OR a.branch = $1)`,
        [branch]
      ),

      // 5. Recalls due for this surgery
      pool.query(
        `SELECT
           p.id,
           p.full_name,
           p.phone,
           p.whatsapp_opt_in,
           (
             SELECT MAX(a.appointment_date)
             FROM appointments a
             WHERE a.patient_id = p.id
             AND a.status = 'completed'
             AND ($1::text IS NULL OR a.branch = $1)
           ) AS last_visit
         FROM patients p
         WHERE (
           $1::text IS NULL
           OR EXISTS (
             SELECT 1
             FROM appointments scope_a
             WHERE scope_a.patient_id = p.id
             AND scope_a.branch = $1
           )
         )
         AND (
           (
             SELECT MAX(a.appointment_date)
             FROM appointments a
             WHERE a.patient_id = p.id
             AND a.status = 'completed'
             AND ($1::text IS NULL OR a.branch = $1)
           ) < CURRENT_DATE - INTERVAL '170 days'
           OR NOT EXISTS (
             SELECT 1
             FROM appointments a
             WHERE a.patient_id = p.id
             AND a.status = 'completed'
             AND ($1::text IS NULL OR a.branch = $1)
           )
         )
         ORDER BY last_visit ASC NULLS FIRST`,
        [branch]
      ),

      // 6. Appointment counts by status
      pool.query(
        `SELECT status, COUNT(*) AS count
         FROM appointments
         WHERE ($1::text IS NULL OR branch = $1)
         GROUP BY status`,
        [branch]
      ),

      // 7. Appointment counts by type
      pool.query(
        `SELECT appointment_type AS type, COUNT(*) AS count
         FROM appointments
         WHERE ($1::text IS NULL OR branch = $1)
         GROUP BY appointment_type
         ORDER BY count DESC
         LIMIT 8`,
        [branch]
      ),

      // 8. Appointment counts by dentist
      pool.query(
        `SELECT
           branch,
           dentist_slot,
           COUNT(*) AS count
         FROM appointments
         WHERE ($1::text IS NULL OR branch = $1)
         GROUP BY branch, dentist_slot
         ORDER BY branch, dentist_slot`,
        [branch]
      ),

      // 9. Surgery-by-surgery statistics.
      // IMPORTANT: Only managers execute this unrestricted query.
      isManager
        ? pool.query(
            `SELECT
               branch,
               COUNT(*) AS total_appointments,
               COUNT(*) FILTER (
                 WHERE status = 'confirmed'
               ) AS confirmed,
               COUNT(*) FILTER (
                 WHERE status = 'completed'
               ) AS completed,
               COUNT(*) FILTER (
                 WHERE status = 'cancelled'
               ) AS cancelled
             FROM appointments
             WHERE branch IS NOT NULL
             GROUP BY branch
             ORDER BY branch`
          )
        : Promise.resolve({ rows: [] })
    ]);

    const response = {
      total_patients: parseInt(totalPatients.rows[0].count, 10),

      todays_appointments: todayAppointments.rows,
      todays_count: todayAppointments.rows.length,

      monthly_appointments: monthlyAppointments.rows.map(row => ({
        month: row.month,
        count: parseInt(row.count, 10)
      })),

      whatsapp: {
        opted_in: parseInt(whatsappOptIns.rows[0].opted_in, 10),
        opted_out: parseInt(whatsappOptIns.rows[0].opted_out, 10),
        total: parseInt(whatsappOptIns.rows[0].total, 10)
      },

      recalls_due: recallsDue.rows,
      recalls_count: recallsDue.rows.length,

      appointments_by_status: appointmentsByStatus.rows.reduce(
        (acc, row) => {
          acc[row.status] = parseInt(row.count, 10);
          return acc;
        },
        {}
      ),

      appointments_by_type: appointmentsByType.rows.map(row => ({
        type: row.type,
        count: parseInt(row.count, 10)
      })),

      appointments_by_dentist: appointmentsByDentist.rows.map(row => ({
        branch: row.branch,
        dentist_slot: row.dentist_slot,
        dentist_name:
          row.branch === 'Love2Smile at Reitz'
            ? (
                Number(row.dentist_slot) === 2
                  ? 'Dr Kekana'
                  : 'Dr Ramosobela'
              )
            : 'Dentist 1',
        count: parseInt(row.count, 10)
      })),

      // Only managers receive surgery-by-surgery statistics.
      branch_stats: isManager
        ? branchStats.rows.map(row => ({
            branch: row.branch,
            total_appointments: parseInt(row.total_appointments, 10),
            confirmed: parseInt(row.confirmed, 10),
            completed: parseInt(row.completed, 10),
            cancelled: parseInt(row.cancelled, 10)
          }))
        : []
    };

    res.json(response);

  } catch (err) {
    console.error('GET /api/analytics error:', err.message);

    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics.'
    });
  }
});

module.exports = router;