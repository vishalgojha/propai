export const PROPAI_ASSISTANT_NUMBER = '+91 7021045254';
export const PROPAI_ASSISTANT_PHONE_DIGITS = '7021045254';
export const PROPAI_ASSISTANT_PREFILL =
  'Hi PropAI Assistant, I need help with my Pulse agent setup.';
export const PROPAI_ASSISTANT_WA_LINK = `https://wa.me/917021045254?text=${encodeURIComponent(PROPAI_ASSISTANT_PREFILL)}`;
export const PROPAI_CONNECT_PREFILL = 'Hi PropAI Assistant, I want to connect my WhatsApp number to start receiving property leads.';
export const PROPAI_CONNECT_WA_LINK = `https://wa.me/917021045254?text=${encodeURIComponent(PROPAI_CONNECT_PREFILL)}`;
export const PROPAI_PLAN_CARDS = [
  {
    name: 'Trial',
    price: '7 days free',
    devices: 'No credit card required',
    blurb: 'Connect your WhatsApp, watch your Stream fill up. Full access, zero commitment.',
  },
  {
    name: 'Pro',
    price: '₹799 / month',
    devices: '1 WhatsApp device',
    blurb: 'Your own private WhatsApp agent. One broker, one phone number, unlimited matches.',
  },
  {
    name: 'Team',
    price: '₹799 / seat / month',
    devices: 'Each member links their own account',
    blurb: 'Multiple brokers, each with their own number and Pulse agent, sharing workspace intelligence — like Google Drive for real estate teams.',
  },
] as const;
