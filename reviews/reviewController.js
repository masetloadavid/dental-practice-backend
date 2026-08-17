const reviewService = require('./reviewService');

async function dashboard(req, res) {
try {
const stats = await reviewService.getDashboardStats();

res.json(stats);
} catch (err) {
console.error(err);
res.status(500).json({
error: 'Failed to load dashboard.'
});
}
}

module.exports = {
dashboard
};