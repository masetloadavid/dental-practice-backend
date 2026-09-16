// =============================================================================
// routes/appointments.js — CRUD endpoints for the appointments table
// =============================================================================

const express = require('express');
const router = express.Router();
const { pool } = require('./db');

// ── Branch / dentist configuration ────────────────────────────────────────────

const validBranches = [
'Love2Smile With Braces',
'Love2Smile at Reitz',
'Love2Smile Cullinan'
];

function validateBranchDentist(branch, dentist_slot) {
if (!validBranches.includes(branch)) {
return 'Invalid branch selected.';
}

const dentist = Number(dentist_slot);

if (!Number.isInteger(dentist)) {
return 'Invalid dentist selection.';
}

if (branch === 'Love2Smile at Reitz') {
if (![1, 2].includes(dentist)) {
return 'At Reitz, please select Dentist 1 or Dentist 2.';
}
} else {
if (dentist !== 1) {
return 'This branch currently has only Dentist 1 available.';
}
}

return null;
}


// ── GET /api/appointments ─────────────────────────────────────────────────────
// Returns all appointments joined with patient name.
// Optional query param: ?date=YYYY-MM-DD
// Optional query param: ?status=confirmed
router.get('/', async (req, res) => {
const { date, status } = req.query;

try {
const conditions = [];
const values = [];
let counter = 1;

if (date) {
conditions.push(`a.appointment_date = $${counter++}`);
values.push(date);
}

if (status) {
conditions.push(`a.status = $${counter++}`);
values.push(status);
}

const whereClause =
conditions.length > 0
? `WHERE ${conditions.join(' AND ')}`
: '';

const result = await pool.query(
`SELECT
a.*,
p.full_name AS patient_name,
p.phone AS patient_phone,
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
res.status(500).json({
error: 'Failed to fetch appointments.'
});
}
});


// ── GET /api/appointments/:id ─────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
const { id } = req.params;

try {
const result = await pool.query(
`SELECT
a.*,
p.full_name AS patient_name,
p.phone AS patient_phone
FROM appointments a
JOIN patients p ON p.id = a.patient_id
WHERE a.id = $1`,
[id]
);

if (result.rows.length === 0) {
return res.status(404).json({
error: 'Appointment not found.'
});
}

res.json(result.rows[0]);

} catch (err) {
console.error(
'GET /api/appointments/:id error:',
err.message
);

res.status(500).json({
error: 'Failed to fetch appointment.'
});
}
});


// ── POST /api/appointments/book-online ───────────────────────────────────────
// ONLINE BOOKING
//
// IMPORTANT:
// Branch/dentist selection is intentionally NOT added here.
// Online patients continue using the existing booking process.

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

// 1. Check if patient already exists
let patient_id;

const existingPatient = await pool.query(
`SELECT id
FROM patients
WHERE (phone = $1 OR email = $2)
AND full_name = $3
LIMIT 1`,
[phone, email, full_name]
);

if (existingPatient.rows.length > 0) {

patient_id = existingPatient.rows[0].id;

} else {

const patientResult = await pool.query(
`INSERT INTO patients
(full_name, phone, email, date_of_birth, whatsapp_opt_in)
VALUES ($1, $2, $3, $4, true)
RETURNING id`,
[
full_name,
phone,
email,
date_of_birth
]
);

patient_id = patientResult.rows[0].id;
}


// 2. Create appointment
const appointmentResult = await pool.query(
`INSERT INTO appointments
(
patient_id,
appointment_date,
appointment_time,
appointment_type,
status,
payment_type,
medical_aid_name,
membership_number,
beneficiary_type
)
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

const appointment_id =
appointmentResult.rows[0].id;


// 3. Create reminders

const oneWeekReminder =
`${appointment_date} 07:00:00`;

const oneDayReminder =
new Date(appointment_date);

oneDayReminder.setDate(
oneDayReminder.getDate() - 1
);

const oneDayReminderString =
oneDayReminder
.toISOString()
.split("T")[0] +
" 07:00:00";

const dayOfReminder =
`${appointment_date} 07:00:00`;


await pool.query(
`
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
]
);


res.json({
success: true,
patient_id,
appointment_id
});

} catch (err) {

console.error(
'Online booking error:',
err.message
);

res.status(500).json({
error: 'Failed to create online booking'
});
}
});


// ── POST /api/appointments ────────────────────────────────────────────────────
// RECEPTIONIST BOOKING
//
// Requires:
// patient_id
// appointment_date
// appointment_time
// branch
// dentist_slot
//
// Branch rules:
// Love2Smile With Braces → Dentist 1
// Love2Smile at Reitz → Dentist 1 OR Dentist 2
// Love2Smile Cullinan → Dentist 1

router.post('/', async (req, res) => {

const {
patient_id,
appointment_date,
appointment_time,
appointment_type = 'Check-up & Clean',
duration_minutes = 60,
status = 'pending',
notes = null,

branch,
dentist_slot = 1

} = req.body;


// ── Basic validation ───────────────────────────────────────────────────────

if (
!patient_id ||
!appointment_date ||
!appointment_time
) {
return res.status(400).json({
error:
'patient_id, appointment_date, and appointment_time are required.'
});
}


// ── Branch / dentist validation ───────────────────────────────────────────

const branchDentistError =
validateBranchDentist(
branch,
dentist_slot
);

if (branchDentistError) {
return res.status(400).json({
error: branchDentistError
});
}


const selectedDentist =
Number(dentist_slot);


// ── Duration validation ───────────────────────────────────────────────────

if (
!Number.isInteger(Number(duration_minutes)) ||
Number(duration_minutes) <= 0
) {
return res.status(400).json({
error: 'Duration must be a positive number of minutes.'
});
}


// Use a transaction so the appointment and reminder rows
// are always created together.

const client = await pool.connect();

try {

await client.query('BEGIN');


// 1. Insert appointment

const apptResult = await client.query(
`INSERT INTO appointments
(
patient_id,
appointment_date,
appointment_time,
appointment_type,
duration_minutes,
status,
notes,
branch,
dentist_slot
)
VALUES
($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *`,
[
patient_id,
appointment_date,
appointment_time,
appointment_type,
Number(duration_minutes),
status,
notes,
branch,
selectedDentist
]
);


const appt =
apptResult.rows[0];


// 2. Auto-schedule appointment reminders

const apptDate =
new Date(appointment_date);

const weekBefore =
new Date(apptDate);

weekBefore.setDate(
apptDate.getDate() - 7
);

const dayBefore =
new Date(apptDate);

dayBefore.setDate(
apptDate.getDate() - 1
);

const dayOf =
new Date(apptDate);


const toISO = (d) =>
d.toISOString().split('T')[0];


const reminderRows = [

[
appt.id,
patient_id,
'one_week_before',
toISO(weekBefore)
],

[
appt.id,
patient_id,
'one_day_before',
toISO(dayBefore)
],

[
appt.id,
patient_id,
'day_of',
toISO(dayOf)
]

];


for (
const [
apptId,
patId,
type,
scheduledFor
] of reminderRows
) {

await client.query(
`INSERT INTO reminders
(
appointment_id,
patient_id,
reminder_type,
scheduled_for
)
VALUES ($1, $2, $3, $4)
ON CONFLICT DO NOTHING`,
[
apptId,
patId,
type,
scheduledFor
]
);
}


await client.query('COMMIT');


res.status(201).json({

...appt,

reminders_scheduled:
reminderRows.map(r => ({
type: r[2],
scheduled_for: r[3]
}))

});


} catch (err) {

await client.query('ROLLBACK');


// PostgreSQL exclusion constraint violation.
//
// This means the selected dentist already has an
// overlapping active appointment.

if (err.code === '23P01') {

return res.status(409).json({
error:
'That dentist already has an appointment during this time. Please choose another time or dentist.'
});
}


console.error(
'POST /api/appointments error:',
err.message
);


res.status(500).json({
error:
'Failed to create appointment.'
});

} finally {

client.release();

}

});


// ── PUT /api/appointments/:id ─────────────────────────────────────────────────
// Updates an appointment.
//
// Branch and dentist can also be changed here.
// The database exclusion constraint protects against overlaps.

router.put('/:id', async (req, res) => {

const { id } = req.params;


const {
appointment_date,
appointment_time,
appointment_type,
duration_minutes,
status,
notes,
branch,
dentist_slot
} = req.body;


try {

const fields = [];
const values = [];
let counter = 1;


// ── Validate branch/dentist when supplied ───────────────────────────────

if (
branch !== undefined ||
dentist_slot !== undefined
) {

// Get the existing appointment first so that
// changing only one of the two still works.

const existingAppointment =
await pool.query(
`SELECT
branch,
dentist_slot
FROM appointments
WHERE id = $1`,
[id]
);


if (
existingAppointment.rows.length === 0
) {
return res.status(404).json({
error: 'Appointment not found.'
});
}


const existing =
existingAppointment.rows[0];


const selectedBranch =
branch !== undefined
? branch
: existing.branch;


const selectedDentist =
dentist_slot !== undefined
? dentist_slot
: existing.dentist_slot;


const branchDentistError =
validateBranchDentist(
selectedBranch,
selectedDentist
);


if (branchDentistError) {
return res.status(400).json({
error: branchDentistError
});
}

}


// ── Normal fields ───────────────────────────────────────────────────────

if (
appointment_date !== undefined
) {
fields.push(
`appointment_date = $${counter++}`
);

values.push(
appointment_date
);
}


if (
appointment_time !== undefined
) {
fields.push(
`appointment_time = $${counter++}`
);

values.push(
appointment_time
);
}


if (
appointment_type !== undefined
) {
fields.push(
`appointment_type = $${counter++}`
);

values.push(
appointment_type
);
}


if (
duration_minutes !== undefined
) {

if (
!Number.isInteger(
Number(duration_minutes)
) ||
Number(duration_minutes) <= 0
) {
return res.status(400).json({
error:
'Duration must be a positive number of minutes.'
});
}

fields.push(
`duration_minutes = $${counter++}`
);

values.push(
Number(duration_minutes)
);
}


if (
status !== undefined
) {
fields.push(
`status = $${counter++}`
);

values.push(
status
);
}


if (
notes !== undefined
) {
fields.push(
`notes = $${counter++}`
);

values.push(
notes
);
}


// ── Branch ──────────────────────────────────────────────────────────────

if (
branch !== undefined
) {
fields.push(
`branch = $${counter++}`
);

values.push(
branch
);
}


// ── Dentist ─────────────────────────────────────────────────────────────

if (
dentist_slot !== undefined
) {
fields.push(
`dentist_slot = $${counter++}`
);

values.push(
Number(dentist_slot)
);
}


if (fields.length === 0) {
return res.status(400).json({
error:
'No fields provided to update.'
});
}


values.push(id);


const result =
await pool.query(
`UPDATE appointments
SET ${fields.join(', ')}
WHERE id = $${counter}
RETURNING *`,
values
);


if (
result.rows.length === 0
) {
return res.status(404).json({
error:
'Appointment not found.'
});
}


// ── Review request when completed ───────────────────────────────────────

if (status === "completed") {

const appointment =
await pool.query(
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


const patient =
appointment.rows[0];


if (
patient &&
patient.email
) {

const existingReview =
await pool.query(
`
SELECT id
FROM review_requests
WHERE appointment_id = $1
`,
[id]
);


if (
existingReview.rows.length === 0
) {

const scheduledFor =
new Date();

scheduledFor.setHours(
18,
0,
0,
0
);


await pool.query(
`
INSERT INTO review_requests
(
appointment_id,
patient_id,
email,
status,
scheduled_for
)
VALUES
($1, $2, $3, $4, $5)
`,
[
id,
patient.patient_id,
patient.email,
"pending",
scheduledFor
]
);

}

}

}


res.json(
result.rows[0]
);


} catch (err) {

// PostgreSQL exclusion constraint violation.
if (err.code === '23P01') {

return res.status(409).json({
error:
'That dentist already has an appointment during this time. Please choose another time or dentist.'
});
}


console.error(
'PUT /api/appointments/:id error:',
err.message
);


res.status(500).json({
error:
'Failed to update appointment.'
});
}

});


// ── DELETE /api/appointments/:id ──────────────────────────────────────────────

router.delete('/:id', async (req, res) => {

const { id } = req.params;

try {

const result =
await pool.query(
`DELETE FROM appointments
WHERE id = $1
RETURNING id`,
[id]
);


if (
result.rows.length === 0
) {
return res.status(404).json({
error:
'Appointment not found.'
});
}


res.json({
message:
`Appointment ${id} deleted.`
});


} catch (err) {

console.error(
'DELETE /api/appointments/:id error:',
err.message
);

res.status(500).json({
error:
'Failed to delete appointment.'
});
}

});


module.exports = router;
