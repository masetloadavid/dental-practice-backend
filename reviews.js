const express = require("express");
const router = express.Router();
const { pool } = require("./db");

router.post("/run", async (req, res) => {
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
console.log(
`Processing review request ${review.id} for ${review.email}`
);
  const reviewLink =
`https://dental-practice-frontend-production.up.railway.app/review?patientId=${review.patient_id}&appointmentId
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
