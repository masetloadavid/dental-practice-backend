const { pool } = require('../db');

async function getDashboardStats() {
const totalReviews = await pool.query(`
SELECT COUNT(*) AS total
FROM reviews
`);

const averageRating = await pool.query(`
SELECT COALESCE(AVG(rating), 0) AS average
FROM reviews
`);

const ratingBreakdown = await pool.query(`
SELECT
rating,
COUNT(*) AS count
FROM reviews
GROUP BY rating
`);

const pendingRequests = await pool.query(`
SELECT COUNT(*) AS total
FROM review_requests
WHERE status = 'pending'
`);

const sentToday = await pool.query(`
SELECT COUNT(*) AS total
FROM review_requests
WHERE DATE(sent_at) = CURRENT_DATE
`);

const stats = {
totalReviews: Number(totalReviews.rows[0].total),
averageRating: Number(averageRating.rows[0].average),

fiveStarReviews: 0,
fourStarReviews: 0,
threeStarReviews: 0,
twoStarReviews: 0,
oneStarReviews: 0,

pendingRequests: Number(pendingRequests.rows[0].total),
sentToday: Number(sentToday.rows[0].total)
};

ratingBreakdown.rows.forEach(r => {
switch (Number(r.rating)) {
case 5:
stats.fiveStarReviews = Number(r.count);
break;
case 4:
stats.fourStarReviews = Number(r.count);
break;
case 3:
stats.threeStarReviews = Number(r.count);
break;
case 2:
stats.twoStarReviews = Number(r.count);
break;
case 1:
stats.oneStarReviews = Number(r.count);
break;
}
});

return stats;
}

module.exports = {
getDashboardStats
};