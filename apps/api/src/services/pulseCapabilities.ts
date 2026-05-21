type PulseCapability = {
  key: string;
  promptBullet: string;
  answerLine: string;
  routerIntent?: string;
  routerLine?: string;
  hint?: string;
};

const CAPABILITIES: PulseCapability[] = [
  {
    key: 'save_listing',
    promptBullet: 'save property listings from plain text or forwarded broker messages',
    answerLine: 'Save listings straight from chat text or forwards.',
    routerIntent: 'save_listing',
    routerLine: '- save_listing: broker wants to add, post, forward, or save a property listing',
    hint: 'You can say: "Add this listing ..." and I will save it for you.',
  },
  {
    key: 'save_requirement',
    promptBullet: 'save buyer or tenant requirements',
    answerLine: 'Log buyer or tenant requirements and match them against inventory.',
    routerIntent: 'save_requirement',
    routerLine: '- save_requirement: broker wants to add a buyer, tenant, or client requirement',
    hint: 'You can say: "Add this requirement ..." and I will save the buyer brief.',
  },
  {
    key: 'create_channel',
    promptBullet: 'create personal stream channels from localities, keywords, or deal filters',
    answerLine: 'Create personal stream channels by locality, keyword, or deal filter.',
    routerIntent: 'create_channel',
    routerLine: '- create_channel: broker wants Pulse to create a personal stream channel from localities, keywords, or deal filters',
    hint: 'You can say: "Create a Powai rentals channel" and I will turn that into a personal stream channel.',
  },
  {
    key: 'crm_pull',
    promptBullet: 'pull back saved listings and requirements from the broker CRM',
    answerLine: 'Pull back your saved listings and requirements from the CRM.',
    routerIntent: 'get_my_listings',
    routerLine: '- get_my_listings: broker wants to see or retrieve their saved listings',
    hint: 'You can say: "Show my saved listings in Andheri" and I will pull them from your CRM.',
  },
  {
    key: 'crm_requirements',
    promptBullet: 'pull back saved buyer and tenant requirements from the broker CRM',
    answerLine: 'Pull back saved buyer and tenant requirements from the CRM.',
    routerIntent: 'get_my_requirements',
    routerLine: '- get_my_requirements: broker wants to see or retrieve their saved buyer or tenant requirements',
    hint: 'You can say: "Show my buyer requirements for Powai" and I will pull them from your CRM.',
  },
  {
    key: 'crm_search',
    promptBullet: 'search across saved broker CRM records',
    answerLine: 'Search across saved CRM records and explain matches.',
    routerIntent: 'search_my_crm',
    routerLine: '- search_my_crm: broker wants to search across saved listings and requirements together',
    hint: 'You can say: "Search my CRM for Bandra 3BHK" and I will search across saved listings and requirements.',
  },
  {
    key: 'inventory_search',
    promptBullet: 'search inventory and explain matches',
    answerLine: 'Search inventory in plain language and explain why something matches.',
    routerIntent: 'search_listings',
    routerLine: '- search_listings: broker wants to find matching properties or query inventory',
    hint: 'You can ask me to find matching inventory in plain language.',
  },
  {
    key: 'semantic_search',
    promptBullet: 'run semantic inventory search from natural-language buyer briefs',
    answerLine: 'Run semantic search from natural-language buyer briefs.',
    routerIntent: 'semantic_search',
    routerLine: '- semantic_search: broker describes what they want in natural language, and the AI finds semantically matching listings from the scraper',
  },
  {
    key: 'follow_ups',
    promptBullet: 'schedule follow-ups and callbacks',
    answerLine: 'Schedule follow-ups and callbacks.',
    routerIntent: 'schedule_callback',
    routerLine: '- schedule_callback: broker wants to create a callback or follow-up reminder',
    hint: 'You can say: "Schedule a follow-up for Raj tomorrow" and I will set the reminder.',
  },
  {
    key: 'follow_up_queue',
    promptBullet: 'show the follow-up queue',
    answerLine: 'Show your follow-up queue.',
    routerIntent: 'check_callbacks',
    routerLine: '- check_callbacks: broker wants to see pending callbacks or the follow-up queue',
    hint: 'You can say: "Show my follow-up queue" to review pending reminders.',
  },
  {
    key: 'web_fetch',
    promptBullet: 'fetch property or project URLs and extract page context',
    answerLine: 'Fetch property or project URLs and inspect the page.',
    routerIntent: 'web_fetch',
    routerLine: '- web_fetch: broker wants to fetch/read a web page or listing URL',
    hint: 'You can paste a property or project URL and I will fetch the page contents for you.',
  },
  {
    key: 'search_web',
    promptBullet: 'search the web for builder, project, and market information',
    answerLine: 'Search the web for builder, project, and market information.',
    routerIntent: 'search_web',
    routerLine: '- search_web: broker wants to search the web for project or market information',
    hint: 'You can ask me to search the web for project, builder, or market information.',
  },
  {
    key: 'verify_rera',
    promptBullet: 'verify RERA registrations and project status',
    answerLine: 'Verify RERA registrations and project status.',
    routerIntent: 'verify_rera',
    routerLine: '- verify_rera: broker wants to verify a RERA registration or project status',
    hint: 'You can ask me to verify a project RERA registration in plain language.',
  },
  {
    key: 'fetch_property_listing',
    promptBullet: 'extract structured property details from listing URLs',
    answerLine: 'Extract structured property details from listing URLs.',
    routerIntent: 'fetch_property_listing',
    routerLine: '- fetch_property_listing: broker wants to extract structured details from a property URL',
    hint: 'You can paste a listing URL and I will extract structured property details.',
  },
  {
    key: 'igr',
    promptBullet: 'pull IGR transaction and locality registration stats',
    answerLine: 'Pull latest IGR transaction and locality registration stats.',
    routerIntent: 'igr_last_transaction',
    routerLine: '- igr_last_transaction: broker wants the latest IGR / registration transaction for a building or locality',
    hint: 'You can ask for the latest IGR transaction or locality registration stats using building plus locality.',
  },
  {
    key: 'igr_locality_stats',
    promptBullet: 'pull locality-level IGR pricing stats and recent registration averages',
    answerLine: 'Pull locality-level IGR pricing stats and recent registration averages.',
    routerIntent: 'igr_locality_stats',
    routerLine: '- igr_locality_stats: broker wants locality-level IGR pricing stats or recent registration averages',
  },
  {
    key: 'runtime_status',
    promptBullet: 'answer product, runtime, privacy, and support questions clearly without pretending',
    answerLine: 'Check live runtime status like active model, WhatsApp connection, linked number, groups, and web-tool availability.',
    routerIntent: 'runtime_status_question',
    routerLine: '- runtime_status_question: broker asks about current model, WhatsApp connection, active number, or browser availability',
    hint: 'You can ask which model is active, whether WhatsApp is connected, which number is live, or whether web tools are available.',
  },
  {
    key: 'privacy_limits',
    promptBullet: 'explain privacy, storage, and workspace plan limits honestly',
    answerLine: 'Explain what Pulse stores, what it can and cannot do, and what the workspace plan allows.',
    routerIntent: 'privacy_or_limits_question',
    routerLine: '- privacy_or_limits_question: broker asks what Pulse stores, whether it auto-messages, or what it can and cannot do',
    hint: 'You can ask what PropAI stores, whether I auto-message anyone, and what your current workspace plan allows.',
  },
  {
    key: 'identity',
    promptBullet: 'answer who Pulse is, who built PropAI, and whether it is AI',
    answerLine: 'Answer who Pulse is, who built PropAI, and whether it is AI.',
    routerIntent: 'identity_question',
    routerLine: '- identity_question: broker asks who built PropAI, what Pulse is, or whether Pulse is AI',
    hint: 'You can ask who built PropAI, what Pulse is, or whether I’m AI, and I’ll answer directly.',
  },
  {
    key: 'support',
    promptBullet: 'handle support issues without pretending something worked',
    answerLine: 'Handle support issues honestly instead of pretending something worked.',
    routerIntent: 'support_issue',
    routerLine: '- support_issue: broker says something is broken or not working',
    hint: 'If something feels broken, send what happened and I’ll guide you or ask for a screenshot for support.',
  },
  {
    key: 'market_advice',
    promptBullet: 'give broker-side positioning and market advice when asked',
    answerLine: 'Give broker-side positioning and market advice when asked.',
    routerIntent: 'market_advice',
    routerLine: '- market_advice: broker asks who to call, what to show, how to position something, or similar advisory questions',
  },
  {
    key: 'send_whatsapp_message',
    promptBullet: 'send WhatsApp messages only when the broker explicitly asks for an outbound send',
    answerLine: 'Send WhatsApp messages only when you explicitly ask for an outbound send.',
    routerIntent: 'send_whatsapp_message',
    routerLine: '- send_whatsapp_message: broker explicitly asks Pulse to send a WhatsApp message to a phone number or contact',
    hint: 'You can ask me to send a WhatsApp message, and I will ask for confirmation before sending.',
  },
  {
    key: 'whatsapp_groups',
    promptBullet: 'check WhatsApp group inventory for the connected workspace',
    answerLine: 'Check WhatsApp group inventory for the connected workspace.',
    routerIntent: 'whatsapp_groups',
    routerLine: '- whatsapp_groups: broker asks to list, count, or inspect WhatsApp groups connected to the workspace',
    hint: 'You can ask me to list or count the WhatsApp groups connected to this workspace.',
  },
];

export function getPulsePrimaryActionBullets() {
  return CAPABILITIES.map((entry) => `- ${entry.promptBullet}`);
}

export function getPulseCapabilityAnswerLines() {
  return CAPABILITIES.map((entry) => `- ${entry.answerLine}`);
}

export function getPulseCapabilityAnswerText() {
  return [
    'Here is what I can do inside Pulse right now:',
    ...getPulseCapabilityAnswerLines(),
  ].join('\n');
}

export function getPulseRouterIntentLines() {
  return CAPABILITIES
    .map((entry) => entry.routerLine)
    .filter((entry): entry is string => Boolean(entry));
}

export function getPulseCapabilityHint(intent: string) {
  return CAPABILITIES.find((entry) => entry.routerIntent === intent)?.hint || '';
}
