// =============================================================================
// whatsapp.js — WhatsApp messaging helper
// =============================================================================
// Currently this file SIMULATES sending messages (logs to console).
// When you are ready to go live, follow the steps in the comments below
// to switch to Twilio or Infobip — it is a one-line change per provider.
// =============================================================================

const PRACTICE_NAME  = 'SmileCare Dental Practice';
const PRACTICE_PHONE = process.env.PRACTICE_PHONE || '+27 11 000 0000';

// ── MESSAGE TEMPLATES ─────────────────────────────────────────────────────────
// Each function returns the WhatsApp message string for that reminder type.

function buildRecallMessage(patientName) {
  return (
    `Hello ${patientName}! This is ${PRACTICE_NAME}. ` +
    `It has been 6 months since your last dental check-up. ` +
    `We recommend booking your routine check-up and clean to keep your smile healthy! ` +
    `Please call us at ${PRACTICE_PHONE} to book your appointment. ` +
    `Reply STOP to opt out of these reminders.`
  );
}

function buildOneWeekMessage(patientName, appointmentDate, appointmentTime, appointmentType) {
  return (
    `Hello ${patientName}! Just a reminder that you have a ${appointmentType} appointment ` +
    `at ${PRACTICE_NAME} on ${appointmentDate} at ${appointmentTime}. ` +
    `We look forward to seeing you! ` +
    `Please call ${PRACTICE_PHONE} if you need to reschedule. ` +
    `Reply STOP to opt out.`
  );
}

function buildOneDayMessage(patientName, appointmentDate, appointmentTime, appointmentType) {
  return (
    `Hello ${patientName}! Reminder: your ${appointmentType} appointment at ${PRACTICE_NAME} ` +
    `is TOMORROW (${appointmentDate}) at ${appointmentTime}. ` +
    `Please remember to arrive 5 minutes early. See you tomorrow! ` +
    `Call ${PRACTICE_PHONE} if you need to cancel.`
  );
}

function buildDayOfMessage(patientName, appointmentTime, appointmentType) {
  return (
    `Good morning, ${patientName}! Your ${appointmentType} appointment at ${PRACTICE_NAME} ` +
    `is TODAY at ${appointmentTime}. We are excited to see you! ` +
    `If you need to cancel, please call ${PRACTICE_PHONE} as soon as possible.`
  );
}

// ── MAIN SEND FUNCTION ────────────────────────────────────────────────────────
/**
 * sendWhatsAppMessage(to, message)
 *
 * @param {string} to      - The patient's phone number, e.g. "+27821234567"
 * @param {string} message - The message body to send
 * @returns {Promise<{ success: boolean, provider: string }>}
 *
 * HOW TO GO LIVE:
 *   1. Fill in your credentials in .env (see .env.example)
 *   2. Uncomment ONE of the provider blocks below (Twilio or Infobip)
 *   3. Install the provider's package:
 *        Twilio:  npm install twilio
 *        Infobip: npm install @infobip-api/sdk
 *   4. Delete or comment out the SIMULATION block
 */
async function sendWhatsAppMessage(to, message) {

  // ── SIMULATION (active by default — safe for development) ─────────────────
  // Remove this block when you switch to a real provider below.
 // console.log('─────────────────────────────────────────');
 // console.log(`[WhatsApp SIMULATION]`);
 // console.log(`To:      ${to}`);
 // console.log(`Message: ${message}`);
 // console.log('─────────────────────────────────────────');
 // return { success: true, provider: 'simulation' };
  // ─────────────────────────────────────────────────────────────────────────


  // ── OPTION A: TWILIO ──────────────────────────────────────────────────────
  // Uncomment this block (and comment out the simulation above) to use Twilio.
  //
   const twilio = require('twilio');
   const client = twilio(
     process.env.TWILIO_ACCOUNT_SID,
     process.env.TWILIO_AUTH_TOKEN
   );
   try {
     await client.messages.create({
       from: process.env.TWILIO_WHATSAPP_NUMBER,  // e.g. "whatsapp:+14155238886"
       to: `whatsapp:${to.replace(/\s/g, "").startsWith("+") ? to.replace(/\s/g, "") : "+27" + to.replace(/\s/g, "").substring(1)}`,
       body: message,
     });
     return { success: true, provider: 'twilio' };
   } catch (err) {
     console.error('[Twilio Error]', err.message);
     return { success: false, provider: 'twilio', error: err.message };
   }
  // ─────────────────────────────────────────────────────────────────────────


  // ── OPTION B: INFOBIP ─────────────────────────────────────────────────────
  // Uncomment this block (and comment out the simulation above) to use Infobip.
  //
  // const { Infobip, AuthType } = require('@infobip-api/sdk');
  // const infobipClient = new Infobip({
  //   baseUrl:  process.env.INFOBIP_BASE_URL,
  //   apiKey:   process.env.INFOBIP_API_KEY,
  //   authType: AuthType.ApiKey,
  // });
  // try {
  //   await infobipClient.channels.whatsapp.send({
  //     type:    'whatsapp',
  //     messages: [{
  //       from: process.env.INFOBIP_WHATSAPP_NUMBER,
  //       to,
  //       content: { body: { type: 'TEXT', text: message } },
  //     }],
  //   });
  //   return { success: true, provider: 'infobip' };
  // } catch (err) {
  //   console.error('[Infobip Error]', err.message);
  //   return { success: false, provider: 'infobip', error: err.message };
  // }
  // ─────────────────────────────────────────────────────────────────────────
}

module.exports = {
  sendWhatsAppMessage,
  buildRecallMessage,
  buildOneWeekMessage,
  buildOneDayMessage,
  buildDayOfMessage,
};
