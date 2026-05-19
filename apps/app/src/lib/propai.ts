export const PROPAI_ASSISTANT_NUMBER = '+91 7021045254';
export const PROPAI_ASSISTANT_PHONE_DIGITS = '7021045254';
export const PROPAI_ASSISTANT_PREFILL =
  'Hi PropAI Assistant, I need help choosing between Personal Parser and PropAI Network.';
export const PROPAI_ASSISTANT_WA_LINK = `https://wa.me/917021045254?text=${encodeURIComponent(PROPAI_ASSISTANT_PREFILL)}`;
export const PROPAI_PLAN_CARDS = [
  {
    name: 'Trial',
    price: '7 days free',
    devices: 'No credit card required',
    blurb: 'Connect WhatsApp, open Monitor, watch Stream fill up, and test WaBro before you pay.',
  },
  {
    name: 'Personal Parser',
    price: '₹999/mo',
    devices: 'Up to 2 WhatsApp devices',
    blurb: 'Private broker stack: your own groups, your own parsed Stream, your own API keys, MCP, and WaBro control.',
  },
  {
    name: 'PropAI Network',
    price: '₹2999/mo',
    devices: 'Up to 5 WhatsApp devices',
    blurb: 'Everything in Personal Parser, plus network-wide broker data, global Stream visibility, agent workflows, MCP, and WaBro broadcasts.',
  },
] as const;
