// twilio.js — Xpress Draft SMS Integration
const twilio = require('twilio');

function getClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+61489084239';

async function sendProposalSMS(clientName, clientPhone, siteAddress, repName, repPhone) {
  if (!clientPhone) {
    console.log('SMS: no phone number for client', clientName);
    return null;
  }

  // Clean phone number - ensure it's in international format
  let phone = clientPhone.replace(/\s/g, '').replace(/[^0-9+]/g, '');
  if (phone.startsWith('0')) phone = '+61' + phone.slice(1);
  if (!phone.startsWith('+')) phone = '+61' + phone;

  const contactLine = repPhone ? `please contact ${repName} directly on ${repPhone}` : `please feel free to contact us`;
  const message = `Hi ${clientName.split(' ')[0]}, this message is to let you know that we have sent you the proposal for your project. Should you have any questions or require any clarification, ${contactLine}. We would be more than happy to assist. Have a lovely day. Sincerely, The Xpressdraft Team. NO REPLY.`;

  try {
    const client = getClient();
    const result = await client.messages.create({
      body: message,
      from: FROM_NUMBER,
      to: phone
    });
    console.log('SMS sent to:', phone, 'SID:', result.sid);
    return result.sid;
  } catch(e) {
    console.error('SMS error:', e.message);
    return null;
  }
}

module.exports = { sendProposalSMS };
