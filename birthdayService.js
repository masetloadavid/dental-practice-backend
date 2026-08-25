// ============================================================
// birthdayService.js
// Automatic birthday wishes for Love2Smile Dental Suites
// ============================================================

const { pool } = require("./db");

// ------------------------------------------------------------
// Send a birthday email through Brevo
// ------------------------------------------------------------
async function sendBirthdayEmail(patient) {
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
email: patient.email,
name: patient.full_name
}
],

subject: "Happy Birthday from Love2Smile Dental Suites! 🎉",

htmlContent: `
<div style="font-family: Arial, sans-serif; line-height: 1.6;">
<h2>🎉 Happy Birthday, ${patient.full_name || "Patient"}!</h2>

<p>
Everyone at <strong>Love2Smile Dental Suites</strong>
would like to wish you a very happy birthday!
</p>

<p>
May your special day be filled with happiness, laughter
and many beautiful smiles. 🦷😊
</p>

<p>
Thank you for trusting us with your dental care.
</p>

<p>
Warm regards,<br>
<strong>Love2Smile Dental Suites</strong>
</p>
</div>
`
})
});

const result = await response.text();

if (!response.ok) {
throw new Error(
`Brevo birthday email failed (${response.status}): ${result}`
);
}

return result;
}

// ------------------------------------------------------------
// Find today's birthdays and send birthday wishes
// ------------------------------------------------------------
async function sendBirthdayWishes() {
console.log("🎂 Starting birthday wishes check...");

const currentYear = new Date().getFullYear();

try {
// --------------------------------------------------------
// Find patients whose birthday is today.
//
// We deliberately ignore the year of birth because
// birthdays repeat every year.
// --------------------------------------------------------
const patientsResult = await pool.query(`
SELECT
id,
full_name,
phone,
email,
date_of_birth
FROM patients
WHERE date_of_birth IS NOT NULL
AND email IS NOT NULL
AND EXTRACT(MONTH FROM date_of_birth) =
EXTRACT(MONTH FROM CURRENT_DATE)
AND EXTRACT(DAY FROM date_of_birth) =
EXTRACT(DAY FROM CURRENT_DATE)
`);

const patients = patientsResult.rows;

console.log(
`🎂 Found ${patients.length} patient(s) with a birthday today.`
);

let sentCount = 0;
let skippedCount = 0;
let failedCount = 0;

for (const patient of patients) {
// ------------------------------------------------------
// Check whether this patient already received a birthday
// wish during the current year.
// ------------------------------------------------------
const existingResult = await pool.query(
`
SELECT id
FROM birthday_wishes
WHERE patient_id = $1
AND birthday_year = $2
AND status = 'sent'
LIMIT 1
`,
[patient.id, currentYear]
);

if (existingResult.rows.length > 0) {
console.log(
`⏭️ Birthday already handled for ${patient.full_name} (${currentYear}).`
);

skippedCount++;
continue;
}

try {
// ----------------------------------------------------
// Send the birthday email
// ----------------------------------------------------
await sendBirthdayEmail(patient);

// ----------------------------------------------------
// Record successful birthday wish
// ----------------------------------------------------
await pool.query(
`
INSERT INTO birthday_wishes
(patient_id, birthday_year, status)
VALUES
($1, $2, 'sent')
ON CONFLICT (patient_id, birthday_year)
DO UPDATE SET
status = 'sent',
sent_at = NOW(),
error_message = NULL
`,
[patient.id, currentYear]
);

console.log(
`✅ Birthday wish sent to ${patient.full_name}.`
);

sentCount++;
} catch (error) {
// ----------------------------------------------------
// Record failed attempt
// ----------------------------------------------------
await pool.query(
`
INSERT INTO birthday_wishes
(patient_id, birthday_year, status, error_message)
VALUES
($1, $2, 'failed', $3)
ON CONFLICT (patient_id, birthday_year)
DO UPDATE SET
status = 'failed',
error_message = EXCLUDED.error_message
`,
[patient.id, currentYear, error.message]
);

console.error(
`❌ Birthday wish failed for ${patient.full_name}:`,
error.message
);

failedCount++;
}
}

console.log("🎂 Birthday wishes check completed.");
console.log(` ✅ Sent: ${sentCount}`);
console.log(` ⏭️ Skipped: ${skippedCount}`);
console.log(` ❌ Failed: ${failedCount}`);

return {
found: patients.length,
sent: sentCount,
skipped: skippedCount,
failed: failedCount
};
} catch (error) {
console.error(
"❌ Birthday wishes check failed:",
error.message
);

throw error;
}
}

// ------------------------------------------------------------
// Export
// ------------------------------------------------------------
module.exports = {
sendBirthdayWishes,
sendBirthdayEmail
};