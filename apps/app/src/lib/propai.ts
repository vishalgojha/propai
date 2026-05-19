export const PROPAI_ASSISTANT_NUMBER = '+91 7021045254';
export const PROPAI_ASSISTANT_PHONE_DIGITS = '7021045254';
export const PROPAI_ASSISTANT_PREFILL =
  'Hi PropAI Assistant, I need help choosing between Personal Parser and PropAI Network.';
export const PROPAI_ASSISTANT_WA_LINK = `https://wa.me/917021045254?text=${encodeURIComponent(PROPAI_ASSISTANT_PREFILL)}`;
export const WABRO_APK_URL = 'https://github.com/vishalgojha/wabro/releases/latest/download/wabro-release.apk';
export const PROPAI_PLAN_CARDS = [
  {
    name: 'Trial',
    price: '7 days free',
    devices: 'No credit card required',
    blurb: 'Connect WhatsApp, open Monitor, watch Stream fill up, and test WaBro before you pay.',
  },
  {
    name: 'Personal Parser',
    price: '₹1499 / bi-annual',
    devices: 'Up to 2 WhatsApp devices',
    blurb: 'Private broker stack: your own groups, your own parsed Stream, your own API keys, MCP, and WaBro control.',
  },
  {
    name: 'PropAI Network',
    price: '₹999',
    devices: 'Network intelligence access',
    blurb: 'Move beyond a private parser into shared PropAI market data, broader listing visibility, and network context.',
  },
  {
    name: 'Team Plan',
    price: '₹2999/mo',
    devices: 'Up to 5 WhatsApp devices',
    blurb: 'Built for broker teams that need shared workspace operations, more connected devices, and coordinated execution.',
  },
  {
    name: 'WaBro',
    price: '₹499 / bi-annual',
    devices: 'Broadcast add-on',
    blurb: 'Outbound broker broadcasts and follow-up execution inside the same PropAI workflow.',
  },
] as const;
