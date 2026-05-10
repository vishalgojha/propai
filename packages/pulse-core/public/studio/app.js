const elements = {};

let currentSourceFilter = null;
let currentTypeFilter = 'ALL';
let currentConfidenceFilter = '';
let currentSearch = '';
let allRecords = [];
let chatHistory = [];
let availableModels = [];
let selectedModel = '';
let waEventSource = null;
let settingsOpen = false;

function text(value) {
  return value === null || value === undefined || value === '' ? 'n/a' : String(value);
}

function escapeHtml(value) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function compact(value, maxLength = 180) {
  const normalized = text(value).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function getHealthStatus(lastTimestamp) {
  if (!lastTimestamp) return 'stale';
  const elapsed = Date.now() - new Date(lastTimestamp).getTime();
  if (elapsed < 3600000) return 'active';
  if (elapsed < 86400000) return 'recent';
  return 'stale';
}

function getHealthColor(status) {
  if (status === 'active') return '#22c55e';
  if (status === 'recent') return '#eab308';
  return '#ef4444';
}

function renderSparkline(messages, slots = 7) {
  const heights = [4, 8, 12, 16, 20, 24, 28];
  const bucketSize = Math.ceil(messages.length / slots) || 1;
  let bars = '';
  for (let i = 0; i < slots; i++) {
    const count = messages.slice(i * bucketSize, (i + 1) * bucketSize).length;
    const h = count > 0 ? heights[Math.min(count - 1, heights.length - 1)] : 2;
    bars += `<span class="spark-bar" style="height:${h}px"></span>`;
  }
  return bars;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
}

function getDashboardUrl() {
  return '/api/dashboard?limit=500';
}

async function loadModels() {
  try {
    const { models } = await fetchJson('/api/models');
    availableModels = models;
    renderModelSelector();
  } catch {
    availableModels = [];
  }
}

function renderModelSelector() {
  const selector = document.getElementById('modelSelector');
  if (!selector) return;
  selector.innerHTML = '';
  for (const model of availableModels) {
    const opt = document.createElement('option');
    opt.value = model.name;
    opt.textContent = `${model.name} (${model.provider})`;
    selector.appendChild(opt);
  }
  if (availableModels.length > 0 && !selectedModel) {
    selectedModel = availableModels[0].name;
  }
}

function renderSources(groups, records) {
  const sourcesCount = document.getElementById('sourcesCount');
  const sourceCountBadge = document.getElementById('sourceCountBadge');
  const sourcesList = document.getElementById('sourcesList');
  const totalGroups = document.getElementById('totalGroups');
  const allSourcesBtn = document.getElementById('allSourcesBtn');

  sourcesCount.textContent = `(${groups.length})`;
  sourceCountBadge.textContent = groups.length;
  totalGroups.textContent = `Total groups: ${groups.length}`;

  const today = new Date().toDateString();
  const todayCount = records.filter(r => new Date(r.timestamp).toDateString() === today).length;
  document.getElementById('totalMessagesToday').textContent = `Messages today: ${todayCount}`;

  if (currentSourceFilter === null) {
    allSourcesBtn.classList.add('selected');
  } else {
    allSourcesBtn.classList.remove('selected');
  }

  sourcesList.replaceChildren(
    ...groups.map(group => {
      const card = document.createElement('article');
      card.className = 'source-card';
      if (currentSourceFilter === group.name) card.classList.add('selected');

      const health = getHealthStatus(group.latest);
      const healthColor = getHealthColor(health);

      card.innerHTML = `
        <div class="source-head">
          <span class="health-dot" style="background:${healthColor}"></span>
          <span class="source-name">${escapeHtml(group.name)}</span>
        </div>
        <div class="source-meta">
          <span class="source-id">${escapeHtml(group.name.slice(0, 20))}...</span>
          <span class="source-time">${group.latest ? new Date(group.latest).toLocaleString() : 'no data'}</span>
        </div>
        <div class="source-stats">
          <span>${group.records} records</span>
          <span>${group.entries} entries</span>
        </div>
        <div class="sparkline">${renderSparkline([])}</div>
      `;

      card.addEventListener('click', () => {
        currentSourceFilter = currentSourceFilter === group.name ? null : group.name;
        renderSources(groups, records);
        renderStream();
      });

      return card;
    }),
  );
}

function renderStream() {
  const streamList = document.getElementById('streamList');
  const emptyStream = document.getElementById('emptyStream');
  const filteredCount = document.getElementById('filteredCount');
  const streamCount = document.getElementById('streamCount');

  let filtered = allRecords;

  if (currentSourceFilter) {
    filtered = filtered.filter(r => (r.group_name || r.group_id) === currentSourceFilter);
  }

  if (currentTypeFilter !== 'ALL') {
    const typeMap = { 'RENT': 'listing_rent', 'SALE': 'listing_sale', 'REQUIREMENT': 'requirement' };
    const filterType = typeMap[currentTypeFilter] || currentTypeFilter;
    filtered = filtered.filter(r => r.type === filterType);
  }

  if (currentConfidenceFilter === 'high') {
    filtered = filtered.filter(r => {
      const entries = Array.isArray(r.entries) ? r.entries : [];
      return entries.some(e => typeof e.confidence === 'number' && e.confidence >= 0.7);
    });
  } else if (currentConfidenceFilter === 'low') {
    filtered = filtered.filter(r => {
      const entries = Array.isArray(r.entries) ? r.entries : [];
      return entries.some(e => typeof e.confidence === 'number' && e.confidence < 0.7);
    });
  }

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    filtered = filtered.filter(r =>
      (r.cleaned_message || r.message || '').toLowerCase().includes(q) ||
      (r.group_name || '').toLowerCase().includes(q)
    );
  }

  filteredCount.textContent = filtered.length;
  streamCount.textContent = `(${filtered.length})`;

  if (filtered.length === 0) {
    streamList.innerHTML = '';
    emptyStream.classList.remove('hidden');
    return;
  }

  emptyStream.classList.add('hidden');
  streamList.replaceChildren(
    ...filtered.map(record => {
      const card = document.createElement('article');
      const entries = Array.isArray(record.entries) ? record.entries : [];

      const avgConfidence = entries.length > 0
        ? entries.reduce((sum, e) => sum + (e.confidence || 0), 0) / entries.length
        : 0;

      let borderColor = '#22c55e';
      if (avgConfidence < 0.5) borderColor = '#ef4444';
      else if (avgConfidence < 0.7) borderColor = '#eab308';

      const isIrrelevant = record.status === 'no_entries' && !record.extraction_error;

      card.className = `stream-card ${isIrrelevant ? 'collapsed' : ''}`;
      card.style.borderLeftColor = borderColor;

      const rawMessage = escapeHtml(compact(record.cleaned_message || record.message, 200));
      const chips = entries.map(e => {
        const location = [e.location?.sub_area, e.location?.area].filter(Boolean).join(', ');
        return `
          <span class="chip">${text(e.area_sqft)} sqft</span>
          <span class="chip">${text(e.budget_min || e.price)}</span>
          <span class="chip">${escapeHtml(location || 'unknown')}</span>
        `;
      }).join('');

      const isReq = record.type === 'requirement';

      card.innerHTML = `
        <div class="stream-raw">${rawMessage}</div>
        ${isIrrelevant ? '<div class="irrelevant-label">NOT RELEVANT</div>' : ''}
        <div class="stream-chips">${chips || '<span class="chip">NO_ENTRIES</span>'}</div>
        <div class="stream-meta">
          <span>${escapeHtml(record.group_name || record.group_id || '').slice(0, 16)}</span>
          <span>${record.type || 'unknown'}</span>
          <span>conf ${avgConfidence.toFixed(2)}</span>
        </div>
        ${isReq ? `<div class="stream-reply-row">
          <button class="draft-reply-btn" data-id="${escapeHtml(record._id || '')}" data-group="${escapeHtml(record.group_id || '')}" data-name="${escapeHtml(record.group_name || '')}" data-msg="${escapeHtml((record.cleaned_message || record.message || '').slice(0, 200))}">
            &#x2709; Draft &amp; Send Reply
          </button>
          <span class="reply-status" id="reply-status-${record._id}" style="display:none"></span>
        </div>` : ''}
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.draft-reply-btn')) return;
        card.classList.toggle('expanded');
      });

      const replyBtn = card.querySelector('.draft-reply-btn');
      if (replyBtn) {
        replyBtn.addEventListener('click', async () => {
          if (replyBtn.disabled) return;
          const allRecords = await fetchListings();
          const reqMsg = replyBtn.dataset.msg;
          const groupId = replyBtn.dataset.group;
          const groupName = replyBtn.dataset.name;
          const recordId = replyBtn.dataset.id;
          replyBtn.disabled = true;
          replyBtn.textContent = 'Drafting...';
          try {
            const context = buildAgentContextClient(allRecords);
            const prompt = `A broker posted this requirement in a WhatsApp group:\n"${reqMsg}"\n\nFrom the available listings below, find the best matches and compose a brief, natural WhatsApp reply. Keep it under 3 short sentences. If no good match, say "Sorry, nothing matching right now."\n\n${context}`;
            const response = await fetchJson('/api/chat', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                model: document.getElementById('modelSelector')?.value || selectedModel || '',
                message: prompt,
                context,
              }),
            });
            const replyText = response.response || response.error || 'Failed to draft reply';
            if (replyText === 'Failed to draft reply') {
              replyBtn.textContent = replyText;
              return;
            }
            await fetchJson('/api/replies', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                groupId,
                groupName,
                sourceMessageId: recordId,
                sourceSenderNumber: '',
                text: replyText,
              }),
            });
            replyBtn.textContent = '\u2713 Sent!';
            replyBtn.style.background = 'var(--green)';
            replyBtn.style.color = '#000';
            setTimeout(() => {
              replyBtn.textContent = '\u2709 Draft & Send Reply';
              replyBtn.disabled = false;
              replyBtn.style.background = '';
              replyBtn.style.color = '';
            }, 3000);
          } catch (err) {
            replyBtn.textContent = 'Error - retry';
            replyBtn.disabled = false;
            setTimeout(() => { replyBtn.textContent = '\u2709 Draft & Send Reply'; }, 2500);
          }
        });
      }

      return card;
    }),
  );
}

async function fetchListings() {
  try {
    const records = await fetchJson('/api/listings?limit=500');
    return records;
  } catch {
    return [];
  }
}

function updateContextLabel(count) {
  const label = document.getElementById('agentContextLabel');
  if (label) label.textContent = `(${count} listings)`;
  const contextLabel = document.getElementById('contextLabel');
  if (contextLabel) contextLabel.textContent = `Agent has context of ${count} listings`;
}

function buildAgentContextClient(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return 'No listings available.';
  }

  const lines = [`LISTINGS CONTEXT (${records.length} records):`];

  for (const record of records) {
    const group = record.group_name || record.group_id || 'unknown';
    const time = record.timestamp ? new Date(record.timestamp).toLocaleString() : 'unknown';
    const type = record.type || 'unknown';
    const status = record.status || 'unknown';
    const message = (record.cleaned_message || record.message || '').slice(0, 120);

    lines.push(`\n[${group}] ${time} | ${type} | ${status}`);
    lines.push(`RAW: ${message}`);

    const entries = Array.isArray(record.entries) ? record.entries : [];
    if (entries.length === 0) {
      if (record.extraction_error) {
        lines.push(`  ERROR: ${record.extraction_error}`);
      } else {
        lines.push(`  NO_ENTRIES`);
      }
    } else {
      for (const entry of entries) {
        const intent = entry.intent || '';
        const propertyType = entry.property_type || '';
        const subArea = entry.location?.sub_area || '';
        const area = entry.location?.area || '';
        const price = entry.price || '';
        const budgetMin = entry.budget_min || '';
        const budgetMax = entry.budget_max || '';
        const sqft = entry.area_sqft || '';
        const confidence = entry.confidence !== undefined ? entry.confidence : '?';

        let entryLine = `  ${intent} ${propertyType}`.trim();
        if (subArea || area) entryLine += ` | ${[subArea, area].filter(Boolean).join(', ')}`;
        if (price) entryLine += ` | price ${price}`;
        if (budgetMin || budgetMax) entryLine += ` | budget ${budgetMin}${budgetMax ? `-${budgetMax}` : ''}`;
        if (sqft) entryLine += ` | ${sqft} sqft`;
        entryLine += ` | conf ${confidence}`;

        lines.push(entryLine);
      }
    }

    if (Array.isArray(record.contacts) && record.contacts.length > 0) {
      lines.push(`  CONTACTS: ${record.contacts.join(', ')}`);
    }
  }

  return lines.join('\n');
}

function appendChatMessage(role, content) {
  const chatMessages = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `chat-bubble ${role}`;
  div.textContent = content;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  indicator.classList.remove('hidden');
}

function hideTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  indicator.classList.add('hidden');
}

async function sendChatMessage(userMessage) {
  const model = document.getElementById('modelSelector')?.value || selectedModel;
  const context = buildAgentContextClient(allRecords);

  const systemPrompt = `You are a real estate data analysis assistant for PropAI Pulse. You have access to all current listings extracted from WhatsApp group messages.

${context}

Answer user questions about these listings accurately. When drafting WhatsApp replies, keep them brief and natural. Use the listing data to provide specific answers with actual numbers and details.
If no listings match a query, say so clearly.
Always be helpful and concise.`;

  try {
    const data = await fetchJson('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, message: userMessage, context: systemPrompt }),
    });
    return data.response || 'No response.';
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  appendChatMessage('user', message);
  chatHistory.push({ role: 'user', content: message });
  showTypingIndicator();

  const agentResponse = await sendChatMessage(message);
  hideTypingIndicator();
  appendChatMessage('agent', agentResponse);
  chatHistory.push({ role: 'assistant', content: agentResponse });
}

function initWhatsAppSettings() {
  const modal = document.getElementById('settingsModal');
  const settingsBtn = document.getElementById('settingsBtn');
  const closeBtn = document.getElementById('closeSettingsBtn');
  const waConnectBtn = document.getElementById('waConnectBtn');
  const waDisconnectBtn = document.getElementById('waDisconnectBtn');
  const saveEnvBtn = document.getElementById('saveEnvBtn');

  settingsBtn?.addEventListener('click', () => {
    modal.classList.remove('hidden');
    settingsOpen = true;
    initWhatsAppSSE();
    loadEnvSettings();
  });

  closeBtn?.addEventListener('click', () => {
    modal.classList.add('hidden');
    settingsOpen = false;
  });

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      settingsOpen = false;
    }
  });

  waConnectBtn?.addEventListener('click', async () => {
    waConnectBtn.disabled = true;
    waConnectBtn.textContent = 'Connecting...';
    try {
      await fetchJson('/api/whatsapp/connect', { method: 'POST' });
    } catch {
      // SSE will update status
    }
  });

  waDisconnectBtn?.addEventListener('click', async () => {
    try {
      await fetchJson('/api/whatsapp/disconnect', { method: 'POST' });
    } catch {
      // ignore
    }
  });

  saveEnvBtn?.addEventListener('click', async () => {
    const googleKey = document.getElementById('envGoogleKey')?.value || '';
    const geminiModel = document.getElementById('envGeminiModel')?.value || '';
    const confidence = document.getElementById('envConfidence')?.value || '0.7';
    const elevenlabsKey = document.getElementById('envElevenLabsKey')?.value || '';
    const elevenlabsVoice = document.getElementById('envElevenLabsVoice')?.value || '';
    saveEnvBtn.disabled = true;
    saveEnvBtn.textContent = 'Saving...';
    try {
      const coolifyBase = 'http://116.202.9.89:8000/api/v1';
      const headers = { 'Authorization': 'Bearer 3|EZTAO9SDr8onCqpahr0hnpWDIHbXWkjkophIfqgd04a6ffdd' };
      const envVars = [
        { key: 'GEMINI_MODEL', value: geminiModel },
        { key: 'GOOGLE_API_KEY', value: googleKey },
        { key: 'REVIEW_CONFIDENCE_THRESHOLD', value: confidence },
        { key: 'ELEVENLABS_API_KEY', value: elevenlabsKey },
        { key: 'ELEVENLABS_VOICE_ID', value: elevenlabsVoice },
      ];
      const envRes = await fetch(`${coolifyBase}/environments/e14dehiuoxbdlexzw6utkth2`, { headers });
      const envData = await envRes.json();
      const existingVars = envData?.variables || [];
      const updatedVars = [...existingVars.filter(v => !envVars.some(e => e.key === v.key))];
      for (const v of envVars) { if (v.value) updatedVars.push(v); }
      await fetch(`${coolifyBase}/environments/e14dehiuoxbdlexzw6utkth2`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables: updatedVars }),
      });
      await fetch(`${coolifyBase}/applications/lburg4buwnc94z9hpx0walg5/restart`, { method: 'POST', headers });
      saveEnvBtn.textContent = 'Saved & Restarting!';
      setTimeout(() => { saveEnvBtn.textContent = 'Save & Restart'; saveEnvBtn.disabled = false; }, 4000);
    } catch {
      saveEnvBtn.textContent = 'Save failed';
      setTimeout(() => { saveEnvBtn.disabled = false; }, 1500);
    }
  });
}

function initWhatsAppSSE() {
  if (waEventSource) {
    waEventSource.close();
  }
  waEventSource = new EventSource('/api/whatsapp/events');
  waEventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    updateWhatsAppUI(data);
  };
  waEventSource.onerror = () => {
    waEventSource.close();
    waEventSource = null;
  };
}

function updateWhatsAppUI(data) {
  const { state, qr, error } = data;
  const badge = document.getElementById('waStatusBadge');
  const qrDisplay = document.getElementById('waQrDisplay');
  const qrCode = document.getElementById('waQrCode');
  const errorDisplay = document.getElementById('waErrorDisplay');
  const errorText = document.getElementById('waErrorText');
  const connectBtn = document.getElementById('waConnectBtn');
  const disconnectBtn = document.getElementById('waDisconnectBtn');

  if (!badge) return;

  badge.className = 'wa-badge ' + state;
  badge.textContent = state.replace('_', ' ');

  if (state === 'qr_available' && qr) {
    qrDisplay?.classList.remove('hidden');
    qrCode.src = qr;
  } else {
    qrDisplay?.classList.add('hidden');
  }

  if (state === 'error' && error) {
    errorDisplay?.classList.remove('hidden');
    if (errorText) errorText.textContent = error;
  } else {
    errorDisplay?.classList.add('hidden');
  }

  if (state === 'disconnected' || state === 'error') {
    connectBtn?.classList.remove('hidden');
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect Phone';
    disconnectBtn?.classList.add('hidden');
  } else if (state === 'connected') {
    connectBtn?.classList.add('hidden');
    disconnectBtn?.classList.remove('hidden');
  } else {
    connectBtn.disabled = true;
    connectBtn.textContent = state === 'starting' ? 'Starting...' : 'Please wait...';
  }
}

async function loadEnvSettings() {
  try {
    const coolifyBase = 'http://116.202.9.89:8000/api/v1';
    const headers = { 'Authorization': 'Bearer 3|EZTAO9SDr8onCqpahr0hnpWDIHbXWkjkophIfqgd04a6ffdd' };
    const envRes = await fetch(`${coolifyBase}/environments/e14dehiuoxbdlexzw6utkth2`, { headers });
    const envData = await envRes.json();
    const vars = envData?.variables || [];
    const byKey = (k) => vars.find(v => v.key === k)?.value || '';

    const geminiModelEl = document.getElementById('envGeminiModel');
    const googleKeyEl = document.getElementById('envGoogleKey');
    const confidenceEl = document.getElementById('envConfidence');

    if (geminiModelEl) geminiModelEl.value = byKey('GEMINI_MODEL') || '';
    if (googleKeyEl) googleKeyEl.value = byKey('GOOGLE_API_KEY') || '';
    if (confidenceEl) confidenceEl.value = byKey('REVIEW_CONFIDENCE_THRESHOLD') || '0.7';
    const elevenKeyEl = document.getElementById('envElevenLabsKey');
    const elevenVoiceEl = document.getElementById('envElevenLabsVoice');
    if (elevenKeyEl) elevenKeyEl.value = byKey('ELEVENLABS_API_KEY') || '';
    if (elevenVoiceEl) elevenVoiceEl.value = byKey('ELEVENLABS_VOICE_ID') || '';
  } catch {
  }
}

let voiceEventSource = null;
let currentAudio = null;

async function initVoiceSSE() {
  if (voiceEventSource) voiceEventSource.close();
  voiceEventSource = new EventSource('/api/voice/events');
  voiceEventSource.onmessage = (event) => {
    const { event: eventName, data } = JSON.parse(event.data);
    if (eventName === 'play_audio') {
      playAudioUrl(data.url, data.volume);
    } else if (eventName === 'new_listing' && data.record) {
      if (voiceSettings.enabled && voiceSettings.autoReadListings) {
        const text = formatRecordForSpeechClient(data.record);
        speakText(text);
      }
    } else if (eventName === 'new_requirement' && data.record) {
      if (voiceSettings.enabled && voiceSettings.autoReadRequirements) {
        const text = formatRecordForSpeechClient(data.record);
        speakText(text, 1.0);
      }
    }
  };
  voiceEventSource.onerror = () => {
    voiceEventSource.close();
    voiceEventSource = null;
  };
}

async function speakText(text, volumeBoost = 0) {
  if (!text || !voiceSettings.enabled) return;
  try {
    const res = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speed: voiceSettings.speed }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (currentAudio) { currentAudio.pause(); URL.revokeObjectURL(currentAudio.src); }
    currentAudio = new Audio(url);
    currentAudio.volume = Math.min(1.0, voiceSettings.volume + volumeBoost);
    currentAudio.play().catch(() => {});
  } catch {}
}

async function testVoice() {
  const btn = document.getElementById('voiceTestBtn');
  const status = document.getElementById('voiceTestStatus');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Speaking...';
  if (status) status.textContent = '';
  try {
    const sampleText = '2 bedroom hall kitchen in Andheri West, semi furnished, forty five thousand rupees per month. This is your PropAI Pulse voice test.';
    await speakText(sampleText);
    if (status) status.textContent = '\u2713 Playing';
    setTimeout(() => {
      if (status) status.textContent = '';
      btn.disabled = false;
      btn.textContent = 'Test Voice';
    }, 3000);
  } catch {
    if (status) status.textContent = 'Error';
    btn.disabled = false;
    btn.textContent = 'Test Voice';
  }
}

function formatRecordForSpeechClient(record) {
  const type = record.type === 'listing_rent' ? 'rent listing' :
    record.type === 'listing_sale' ? 'sale listing' :
      record.type === 'requirement' ? 'requirement' : 'message';
  const groupName = record.group_name || 'unknown group';
  const entries = Array.isArray(record.entries) ? record.entries : [];
  if (entries.length === 0) return `New ${type} in ${groupName}`;
  const e = entries[0];
  const parts = [];
  if (e.property_type) parts.push(e.property_type);
  if (e.location?.sub_area || e.location?.area) parts.push(`in ${[e.location.sub_area, e.location.area].filter(Boolean).join(', ')}`);
  if (e.price) parts.push(e.price);
  if (e.area_sqft) parts.push(`${e.area_sqft} sq ft`);
  if (e.furnishing) parts.push(e.furnishing);
  return `New ${type}: ${parts.join(', ')}`;
}

function initVoiceControls() {
  const voiceEnabled = document.getElementById('voiceEnabled');
  const voiceAutoListings = document.getElementById('voiceAutoListings');
  const voiceAutoRequirements = document.getElementById('voiceAutoRequirements');
  const voiceBriefingEnabled = document.getElementById('voiceBriefingEnabled');
  const voiceSpeed = document.getElementById('voiceSpeed');
  const voiceTestBtn = document.getElementById('voiceTestBtn');

  voiceTestBtn?.addEventListener('click', testVoice);

  async function saveVoiceSettings() {
    try {
      await fetchJson('/api/voice/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: voiceEnabled?.checked || false,
          autoReadListings: voiceAutoListings?.checked || false,
          autoReadRequirements: voiceAutoRequirements?.checked || false,
          speed: voiceSpeed?.value || 'normal',
          volume: 1.0,
        }),
      });
    } catch {}
  }

  voiceEnabled?.addEventListener('change', saveVoiceSettings);
  voiceAutoListings?.addEventListener('change', saveVoiceSettings);
  voiceAutoRequirements?.addEventListener('change', saveVoiceSettings);
  voiceBriefingEnabled?.addEventListener('change', saveVoiceSettings);
  voiceSpeed?.addEventListener('change', saveVoiceSettings);

  async function loadVoiceSettings() {
    try {
      const settings = await fetchJson('/api/voice/settings');
      voiceSettings = settings;
      if (voiceEnabled) voiceEnabled.checked = settings.enabled || false;
      if (voiceAutoListings) voiceAutoListings.checked = settings.autoReadListings !== false;
      if (voiceAutoRequirements) voiceAutoRequirements.checked = settings.autoReadRequirements !== false;
      if (voiceSpeed) voiceSpeed.value = settings.speed || 'normal';
      if (settings.enabled) initVoiceSSE();
    } catch {
      voiceSettings = { enabled: false, autoReadListings: true, autoReadRequirements: true, speed: 'normal', volume: 1.0 };
    }
  }

  loadVoiceSettings();

  document.getElementById('briefingBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('briefingBtn');
    if (btn) { btn.disabled = true; }
    try {
      const res = await fetch('/api/voice/briefing', { method: 'POST' });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (currentAudio) { currentAudio.pause(); URL.revokeObjectURL(currentAudio.src); }
        currentAudio = new Audio(url);
        currentAudio.volume = voiceSettings.volume;
        currentAudio.play().catch(() => {});
      }
    } catch {}
    if (btn) { btn.disabled = false; }
  });
}

let lastSeenTimestamp = null;

async function refresh() {
  try {
    const { summary, review, groups, replies } = await fetchJson(getDashboardUrl());
    const records = await fetchListings();

    if (voiceSettings.enabled && lastSeenTimestamp !== null) {
      const newRecords = records.filter(r => r.timestamp && r.timestamp > lastSeenTimestamp);
      for (const record of newRecords) {
        const text = formatRecordForSpeechClient(record);
        if (record.type === 'requirement' && voiceSettings.autoReadRequirements) {
          speakText(text, 1.0);
        } else if (voiceSettings.autoReadListings) {
          speakText(text);
        }
      }
    }

    if (records.length > 0 && records[0].timestamp) {
      lastSeenTimestamp = records[0].timestamp;
    }

    allRecords = records;

    updateContextLabel(records.length);
    renderSources(groups, records);
    renderStream();

    const liveStatus = document.getElementById('liveStatus');
    const liveLabel = document.getElementById('liveLabel');
    if (liveStatus) liveStatus.className = 'live-status live';
    if (liveLabel) liveLabel.textContent = 'LIVE';
  } catch (error) {
    console.error('Refresh failed:', error);
  }
}

function init() {
  document.getElementById('chatForm').addEventListener('submit', handleChatSubmit);

  document.getElementById('allSourcesBtn').addEventListener('click', () => {
    currentSourceFilter = null;
    refresh();
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    currentSearch = e.target.value;
    renderStream();
  });

  for (const chip of document.querySelectorAll('.filter-chips .chip')) {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentTypeFilter = chip.dataset.type;
      renderStream();
    });
  }

  document.getElementById('confidenceFilter').addEventListener('change', (e) => {
    currentConfidenceFilter = e.target.value;
    renderStream();
  });

  document.getElementById('refreshBtn').addEventListener('click', refresh);

  for (const btn of document.querySelectorAll('.prompt-btn')) {
    btn.addEventListener('click', () => {
      const input = document.getElementById('chatInput');
      input.value = btn.textContent;
      document.getElementById('chatForm').dispatchEvent(new Event('submit'));
    });
  }

  loadModels();
  refresh();
  initWhatsAppSettings();
  initVoiceControls();
  setInterval(refresh, 15000);
}

document.addEventListener('DOMContentLoaded', init);
