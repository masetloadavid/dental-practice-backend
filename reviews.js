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

return res.json({
success: true,
found: reviews.rows.length,
reviews: reviews.rows
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
