// stripe.js — Xpress Draft Stripe Integration
const Stripe = require('stripe');

function getStripe() {
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

// Create a payment link for the deposit amount
async function createDepositPaymentLink(clientName, siteAddr, depositAmount, proposalNumber) {
  const stripe = getStripe();

  // Create a price object for this specific amount
  const price = await stripe.prices.create({
    currency: 'aud',
    unit_amount: Math.round(depositAmount * 100), // Stripe uses cents
    product_data: {
      name: `Deposit — ${proposalNumber || 'Xpress Draft Proposal'}`,
      description: `Project deposit for ${clientName} — ${siteAddr}`,
    },
  });

  // Create a payment link
  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{
      price: price.id,
      quantity: 1,
    }],
    after_completion: {
      type: 'redirect',
      redirect: { url: 'https://www.xpressdraft.com.au' },
    },
    metadata: {
      client_name: clientName,
      site_address: siteAddr,
      proposal_number: proposalNumber || '',
    },
  });

  return paymentLink.url;
}

module.exports = { createDepositPaymentLink };
