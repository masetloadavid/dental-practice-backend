const cron = require("node-cron");
const { sendBirthdayWishes } = require('./birthdayService');

function startScheduler() {
console.log("🗓️ Scheduler started");

//
// 07:00 Appointment Reminder Job
//
console.log("Registering 07:00 appointment reminder job...");

cron.schedule("0 7 * * *", async () => {
console.log("🕖 Running appointment reminders...");

try {
const response = await fetch("http://localhost:3001/api/reminders/run", {
method: "POST"
});

const data = await response.json();

console.log("✅ Appointment reminders completed:", data);
} catch (err) {
console.error("❌ Appointment reminder scheduler failed:", err.message);
}
});

console.log("✅ 07:00 job registered");

// ── 08:00 Birthday Wishes Job ──

console.log('Registering 08:00 birthday wishes job...');

cron.schedule('0 8 * * *', async () => {
console.log('🎂 Running birthday wishes...');

try {
const data = await sendBirthdayWishes();

console.log('✅ Birthday wishes completed:', data);
} catch (err) {
console.error('❌ Birthday wishes scheduler failed:', err.message);
}
}, {
timezone: 'Africa/Johannesburg'
});

console.log('✅ 08:00 birthday wishes job registered');

//
// 18:00 Review Request Job
//
console.log("Registering 18:00 review request job...");

cron.schedule("0 18 * * *", async () => {
console.log("🌟 Running review requests...");

try {
const response = await fetch("http://localhost:3001/api/reviews/run", {
method: "POST",
headers: {
"x-review-secret": process.env.REVIEW_RUN_SECRET
}
});

const data = await response.json();

console.log("✅ Review requests completed:", data);
} catch (err) {
console.error("❌ Review scheduler failed:", err.message);
}
});

console.log("✅ 18:00 job registered");
}

module.exports = startScheduler;