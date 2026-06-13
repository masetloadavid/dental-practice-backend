// =============================================================================
// routes/reminders.js — Reminder fetch + the main reminder-run engine
// =============================================================================

const express = require('express');
const router  = express.Router();
const { pool } = require('./db');
const {
  sendWhatsAppMessage,
  buildRecallMessage,
  buildOneWeekMessage,
  buildOneDayMessage,
  buildDayOfMessage,
} = require('./whatsapp');

// ── GET /api/reminders ────────────────────────────────────────────────────────
// Returns all reminder records, optionally filtered.
// Query params: ?sent=false  →  only unsent reminders
//               ?patient_id=5  →  only for a specific patient
router.get('/', async (req, res) => {
  const { sent, patient_id } = req.query;

  try {
    const conditions = [];
    const values     = [];
    let   counter    = 1;

    if (sent       !== undefined) { conditions.push(`r.sent = $${counter++}`);        values.push(sent === 'true'); }
    if (patient_id !== undefined) { conditions.push(`r.patient_id = $${counter++}`);  values.push(patient_id); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         r.*,
         p.full_name  AS patient_name,
         p.phone      AS patient_phone,
         a.appointment_date,
         a.appointment_time,
         a.appointment_type
       FROM reminders r
       JOIN patients p ON p.id = r.patient_id
       LEFT JOIN appointments a ON a.id = r.appointment_id
       ${whereClause}
       ORDER BY r.scheduled_for ASC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/reminders error:', err.message);
    res.status(500).json({ error: 'Failed to fetch reminders.' });
  }
});

// ── POST /api/reminders/run ───────────────────────────────────────────────────
// The main reminder engine. Call this endpoint once per day (e.g. via a Railway
// cron job or an external scheduler like cron-job.org).
//
// What it does:
//   1. Finds all unsent reminders where scheduled_for = TODAY
//   2. Skips patients who have not opted in to WhatsApp
//   3. Sends the appropriate WhatsApp message
//   4. Marks the reminder as sent in the database
//   5. Checks for any 6-month recalls due and sends those too
//
// Returns: a summary of what was sent
router.post('/run', async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Reminder job started'
  });

  console.log('REAL REMINDER ROUTE STARTED');
  const today     = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
  const results   = { sent: [], skipped: [], errors: [] };

  try {
    // ── STEP 1: Appointment reminders due today ───────────────────────────────
    const dueReminders = await pool.query(
      `SELECT
         r.id              AS reminder_id,
         r.reminder_type,
         r.appointment_id,
         p.id              AS patient_id,
         p.full_name,
         p.phone,
         p.whatsapp_opt_in,
         a.appointment_date,
         a.appointment_time,
         a.appointment_type,
         a.status          AS appointment_status
       FROM reminders r
       JOIN patients p     ON p.id = r.patient_id
       LEFT JOIN appointments a ON a.id = r.appointment_id
       WHERE r.sent = false
         AND r.scheduled_for::date = $1::date
         AND r.reminder_type != 'six_month_recall'`,
      [today]
    );

    console.log('DUE REMINDERS FOUND:', dueReminders.rows.length);

    for (const reminder of dueReminders.rows) {
      // Skip if patient has not opted in
      if (!reminder.whatsapp_opt_in) {
        results.skipped.push({
          reminder_id: reminder.reminder_id,
          patient:     reminder.full_name,
          reason:      'WhatsApp opt-in is false',
        });
        continue;
      }

      // Skip if the appointment has been cancelled
      if (reminder.appointment_status === 'cancelled') {
        results.skipped.push({
          reminder_id: reminder.reminder_id,
          patient:     reminder.full_name,
          reason:      'Appointment is cancelled',
        });
        continue;
      }

      // Build the correct message for this reminder type
      const apptDateFormatted = new Date(reminder.appointment_date)
        .toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const apptTime = reminder.appointment_time
        ? reminder.appointment_time.slice(0, 5) // "HH:MM"
        : '';

      let message = '';
      switch (reminder.reminder_type) {
        case 'one_week_before':
          message = buildOneWeekMessage(reminder.full_name, apptDateFormatted, apptTime, reminder.appointment_type);
          break;
        case 'one_day_before':
          message = buildOneDayMessage(reminder.full_name, apptDateFormatted, apptTime, reminder.appointment_type);
          break;
        case 'day_of':
          message = buildDayOfMessage(reminder.full_name, apptTime, reminder.appointment_type);
          break;
        default:
          continue;
      }

      // Send the WhatsApp message
      console.log('ABOUT TO SEND WHATSAPP TO:', reminder.phone);
      const sendResult = await sendWhatsAppMessage(reminder.phone, message);

      if (sendResult.success) {
        // Mark reminder as sent
        await pool.query(
          'UPDATE reminders SET sent = true, sent_at = NOW() WHERE id = $1',
          [reminder.reminder_id]
        );
        results.sent.push({
          reminder_id: reminder.reminder_id,
          type:        reminder.reminder_type,
          patient:     reminder.full_name,
          phone:       reminder.phone,
          provider:    sendResult.provider,
        });
      } else {
        results.errors.push({
          reminder_id: reminder.reminder_id,
          patient:     reminder.full_name,
          error:       sendResult.error,
        });
      }
    }

    // ── STEP 2: Six-month recall reminders ────────────────────────────────────
    // A recall is due if the patient has no appointment booked in the next
    // 30 days AND their last appointment was ~6 months ago.
    // We approximate this by checking for patients whose most recent completed
    // appointment was 180+ days ago and who have no upcoming appointment.
    const recallCandidates = await pool.query(
      `SELECT
         p.id,
         p.full_name,
         p.phone,
         p.whatsapp_opt_in,
         MAX(a.appointment_date) AS last_appointment_date
       FROM patients p
       LEFT JOIN appointments a
         ON a.patient_id = p.id AND a.status = 'completed'
       WHERE p.whatsapp_opt_in = true
       GROUP BY p.id, p.full_name, p.phone, p.whatsapp_opt_in
       HAVING
         -- Last completed appointment was 180+ days ago (or never)
         MAX(a.appointment_date) < NOW() - INTERVAL '180 days'
         OR MAX(a.appointment_date) IS NULL`
    );

    for (const patient of recallCandidates.rows) {
      // Make sure we have not already sent a recall reminder this month
      const alreadySent = await pool.query(
        `SELECT id FROM reminders
         WHERE patient_id    = $1
           AND reminder_type = 'six_month_recall'
           AND sent          = true
           AND sent_at       > NOW() - INTERVAL '30 days'`,
        [patient.id]
      );
      if (alreadySent.rows.length > 0) continue;

      const message      = buildRecallMessage(patient.full_name);
      console.log('ABOUT TO SEND WHATSAPP TO:', reminder.phone);
      const sendResult   = await sendWhatsAppMessage(patient.phone, message);

      if (sendResult.success) {
        // Log the recall reminder
        await pool.query(
          `INSERT INTO reminders
             (patient_id, reminder_type, scheduled_for, sent, sent_at)
           VALUES ($1, 'six_month_recall', $2, true, NOW())`,
          [patient.id, today]
        );
        results.sent.push({
          type:     'six_month_recall',
          patient:  patient.full_name,
          phone:    patient.phone,
          provider: sendResult.provider,
        });
      } else {
        results.errors.push({ patient: patient.full_name, error: sendResult.error });
      }
    }

    // Return a summary
     res.json({
      date:          today,
      total_sent:    results.sent.length,
      total_skipped: results.skipped.length,
      total_errors:  results.errors.length,
      sent:          results.sent,
      skipped:       results.skipped,
      errors:        results.errors,
    });

  } catch (err) {
  console.error('REMINDER ERROR:', err);
  console.error('MESSAGE:', err.message);
  console.error('STACK:', err.stack);

  return res.status(500).json({
    error: err.message
  });
}
});

module.exports = router;
