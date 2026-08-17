const express = require("express");
const router = express.Router();
const { pool } = require("./db");
const sendReviewRequest = require("./reviewMailer");
const reviewController = require('./reviews/reviewController');

router.get("/dashboard", reviewController.dashboard);

router.post("/run", async (req, res) => {
    const secret = req.headers["x-review-secret"];

if (secret !== process.env.REVIEW_RUN_SECRET) {
return res.status(401).json({
success: false,
error: "Unauthorized"
});
}

const now = new Date();

try {
const reviews = await pool.query(
`
SELECT *
FROM review_requests
WHERE status = 'pending'
AND scheduled_for <= $1
ORDER BY scheduled_for ASC
`,
[now]
);

for (const review of reviews.rows) {

try {

const patient = await pool.query(
`
SELECT full_name, phone, email
FROM patients
WHERE id = $1
`,
[review.patient_id]
);

if (patient.rows.length === 0) {
console.log(`Patient not found for review ${review.id}`);
continue;
}

const p = patient.rows[0];

await sendReviewRequest({
patientName: p.full_name,
patientEmail: p.email,
patientPhone: p.phone
});

await pool.query(
`
UPDATE review_requests
SET
status='sent',
sent_at=NOW()
WHERE id=$1
`,
[review.id]
);

console.log(`Review request sent to ${p.full_name}`);

} catch (err) {
console.error(err);
}

}

return res.json({
success: true,
found: reviews.rows.length,
processed: reviews.rows.length
});

} catch (err) {
console.error(err);
return res.status(500).json({
success: false,
error: err.message
});
}
});

module.exports = router;
