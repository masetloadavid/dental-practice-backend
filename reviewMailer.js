const sendReviewRequest = async ({
patientName,
patientEmail,
patientPhone
}) => {

const reviewLink =
`https://dental-practice-frontend-production.up.railway.app/review?name=${encodeURIComponent(patientName)}&phone=${encodeURIComponent(patientPhone)}`;

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
email: patientEmail
}
],
subject: "How was your visit at Love2Smile?",
htmlContent: `
<h2>Hello ${patientName || "Patient"} 👋</h2>

<p>Thank you for visiting Love2Smile Dental Suites.</p>

<p>Please click below to leave us a quick review.</p>

<a href="${reviewLink}"
style="
background:#2563eb;
color:white;
padding:12px 20px;
border-radius:8px;
text-decoration:none;
display:inline-block;
">
Leave Review
</a>
`
})
});

const result = await response.json();

if (!response.ok) {
throw new Error(JSON.stringify(result));
}

return result;
};

module.exports = sendReviewRequest;