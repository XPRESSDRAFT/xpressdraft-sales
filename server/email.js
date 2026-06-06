// email.js — Xpress Draft Email System
const nodemailer = require('nodemailer');

function getTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: 'info@xpressdraft.com.au',
      pass: process.env.EMAIL_PASSWORD
    }
  });
}

const SIGNATURE = `
<br><br>
<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#2A2B29">Kind regards,</p>
<br>
<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#2A2B29;font-weight:bold">Management Team</p>
<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#555">1300 156 669</p>
<br>
<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#EA672F;font-weight:bold">XPRESSDRAFT<span style="color:#2A2B29;font-weight:normal"> — More than just plans</span></p>
<p style="margin:0;font-family:Arial,sans-serif;font-size:13px"><a href="https://www.xpressdraft.com.au" style="color:#EA672F">www.xpressdraft.com.au</a></p>
`;

const LOGO = `
<div style="margin-bottom:28px">
  <svg width="40" height="40" viewBox="0 0 191 189" xmlns="http://www.w3.org/2000/svg">
    <path fill="#2A2B29" d="M46.6 6.5v29.6c0 1.9 1.1 3.7 2.8 4.5l42.8 23.9c1.9.9 4.1.9 6 0l42.8-23.9c1.7-.8 2.8-2.6 2.8-4.5V6.5c0-4.8-5-7.9-9.3-5.9L98.3 18c-1.9.9-4.1.9-6 0L55.9.6c-4.3-2-9.3 1.1-9.3 5.9"/>
    <path fill="#2A2B29" d="M46.6 181.2v-29.6c0-1.9 1.1-3.7 2.8-4.5l42.8-23.9c1.9-.9 4.1-.9 6 0l42.8 23.9c1.7.8 2.8 2.6 2.8 4.5v29.6c0 4.8-5 7.9-9.3 5.9L98.3 169.8c-1.9-.9-4.1-.9-6 0l-36.4 17.3c-4.3 2-9.3-1.1-9.3-5.9"/>
    <path fill="#2A2B29" d="M182.6 45.2h-29.6c-1.9 0-3.7 1.1-4.5 2.8l-23.9 42.8c-.9 1.9-.9 4.1 0 6l23.9 42.8c.8 1.7 2.6 2.8 4.5 2.8h29.6c4.8 0 7.9-5 5.9-9.3l-17.4-36.3c-.9-1.9-.9-4.1 0-6l17.4-36.3c2-4.3-1.1-9.3-5.9-9.3"/>
    <path fill="#EA672F" d="M7.9 45.2h29.6c1.9 0 3.7 1.1 4.5 2.8l23.9 42.8c.9 1.9.9 4.1 0 6l-23.9 42.8c-.8 1.7-2.6 2.8-4.5 2.8H7.9c-4.8 0-7.9-5-5.9-9.3l17.4-36.3c.9-1.9.9-4.1 0-6L2 54.5c-2-4.3 1.1-9.3 5.9-9.3"/>
  </svg>
  <span style="font-family:Arial,sans-serif;font-size:22px;font-weight:800;color:#EA672F;vertical-align:middle;margin-left:10px">Xpress</span>
  <span style="font-family:Arial,sans-serif;font-size:22px;font-weight:800;color:#2A2B29;vertical-align:middle"> Draft</span>
</div>
`;

function emailWrapper(content) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F3EAE5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3EAE5;padding:40px 0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
      <tr><td style="background:#2A2B29;padding:24px 32px">
        ${LOGO.replace('fill="#2A2B29"', 'fill="#F3EAE5"').replace('fill="#2A2B29"', 'fill="#F3EAE5"').replace('fill="#2A2B29"', 'fill="#F3EAE5"')}
      </td></tr>
      <tr><td style="padding:36px 40px;color:#2A2B29;font-size:15px;line-height:1.7">
        ${content}
        ${SIGNATURE}
      </td></tr>
      <tr><td style="background:#F3EAE5;padding:20px 40px;text-align:center;font-size:12px;color:#999;border-top:1px solid #e0d9d5">
        QBCC: 1131941 &nbsp;·&nbsp; <a href="https://www.xpressdraft.com.au" style="color:#EA672F">www.xpressdraft.com.au</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Email 1: Simple welcome (under $5K) ───────────────────────────────────────
function buildSimpleWelcomeEmail(clientName, pandadocLink) {
  const firstName = (clientName || 'there').split(' ')[0];
  const content = `
    <p style="margin:0 0 16px">Hi ${firstName},</p>
    <p style="margin:0 0 16px">We are very pleased that we will start on your project! <strong>Congratulations on choosing Xpressdraft!</strong></p>
    <p style="margin:0 0 16px">My name is Luiz Braga, and I am the designer who is responsible for your project. If you have any questions from now on, please don't hesitate to contact me.</p>
    <p style="margin:0 0 16px">To ensure we have all the necessary information about your project, please complete the Pre-Consultation Form below to the best of your ability so we can start drafting based on your own words and design considerations.</p>
    <p style="margin:0 0 16px">Please don't feel any pressure to get us the "right answer". This form is only to help us get your instructions and stay aware of relevant matters.</p>
    <p style="margin:0 0 24px">And please don't forget to tell us what is the best time and date for attending the site visit if that is part of the scope of work for your project (if you haven't done so).</p>
    ${pandadocLink ? `<div style="text-align:center;margin:28px 0">
      <a href="${pandadocLink}" style="background:#EA672F;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;display:inline-block">Complete Pre-Consultation Form</a>
    </div>` : ''}
    <p style="margin:0 0 16px">Looking forward to hearing from you so we can start the first sketches!</p>
    <p style="margin:0">Have a great day.</p>
  `;
  return {
    subject: "Let's get started!",
    html: emailWrapper(content)
  };
}

// ── Email 2: Portal welcome (jobs $5K and over) ───────────────────────────────
function buildPortalWelcomeEmail(clientName, portalEmail, portalPassword, pandadocLink) {
  const firstName = (clientName || 'there').split(' ')[0];
  const portalUrl = 'https://cea867e70e3ddd1e_cp.clientportalbuilder.com/login';
  const content = `
    <p style="margin:0 0 16px">Hi ${firstName},</p>
    <p style="margin:0 0 16px"><strong>Congratulations on choosing Xpressdraft!</strong></p>
    <p style="margin:0 0 16px">Your Xpressdraft account has been created:</p>
    <table style="background:#F3EAE5;border-radius:10px;padding:16px 24px;margin:0 0 24px;width:100%;box-sizing:border-box">
      <tr>
        <td style="font-size:13px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;padding-bottom:6px">Email</td>
        <td style="font-size:15px;color:#2A2B29;font-weight:600;padding-bottom:6px">${portalEmail || '—'}</td>
      </tr>
      <tr>
        <td style="font-size:13px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px">Password</td>
        <td style="font-size:15px;color:#2A2B29;font-weight:600">${portalPassword || '—'}</td>
      </tr>
    </table>
    <div style="text-align:center;margin:0 0 28px">
      <a href="${portalUrl}" style="background:#2A2B29;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;display:inline-block">Sign in to your Client Portal</a>
    </div>
    <p style="margin:0 0 16px">Through your portal you can see the progress of your work, communicate directly with the designer assigned to your project, upload markups if required, and download your plans.</p>
    <p style="margin:0 0 16px">To help us gather the necessary details, please also complete the Pre-Consultation Form below as best as you can. This helps us understand your preferences for materials, finishes, sizes, or heights to incorporate into your design.</p>
    <p style="margin:0 0 24px">Don't worry about having perfect answers — the form simply helps us capture your ideas and expectations accurately.</p>
    ${pandadocLink ? `<div style="text-align:center;margin:0 0 28px">
      <a href="${pandadocLink}" style="background:#EA672F;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:10px;display:inline-block">Complete Pre-Consultation Form</a>
    </div>` : ''}
    <p style="margin:0">If you have any questions, please don't hesitate to reach out. We're excited to get started and look forward to delivering a design you'll love!</p>
  `;
  return {
    subject: "Welcome to Xpressdraft — Your account is ready",
    html: emailWrapper(content)
  };
}

// ── Send email ────────────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: '"Xpress Draft" <info@xpressdraft.com.au>',
    to,
    subject,
    html
  });
}

// ── Send simple welcome email ─────────────────────────────────────────────────
async function sendSimpleWelcome(clientName, clientEmail, pandadocLink) {
  const { subject, html } = buildSimpleWelcomeEmail(clientName, pandadocLink);
  await sendEmail(clientEmail, subject, html);
}

// ── Send portal welcome email ─────────────────────────────────────────────────
async function sendPortalWelcome(clientName, clientEmail, portalEmail, portalPassword, pandadocLink) {
  const { subject, html } = buildPortalWelcomeEmail(clientName, portalEmail, portalPassword, pandadocLink);
  await sendEmail(clientEmail, subject, html);
}

module.exports = { sendSimpleWelcome, sendPortalWelcome, buildSimpleWelcomeEmail, buildPortalWelcomeEmail };
