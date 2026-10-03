import Stripe from 'stripe';

export const stripeAdmin = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-09-30.endive',
});