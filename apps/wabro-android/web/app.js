const sessionStorageKey = "wabro-propai-session";

const state = {
  session: null,
  user: null,
  stats: null,
  campaigns: [],
  contactLists: [],
  contactsByList: new Map(),
  serviceState: "checking"
};

function getApiBase() {
  const { hostname, protocol } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3001/api";
  }
  if (hostname.endsWith("propai.live")) {
    return `${protocol}//api.propai.live/api`;
  }
  return `${window.location.origin}/api`;
}

const apiBase = getApiBase();

function consumeAuthQueryParams() {
  const url = new URL(window.location.href);
  const email = url.searchParams.get("email");
  const hasSensitiveParams = ["password", "token", "refresh_token", "access_token"].some((key) => url.searchParams.has(key));
  const hasEmailParam = url.searchParams.has("email");

  if (hasEmailParam || hasSensitiveParams) {
    url.searchParams.delete("password");
    url.searchParams.delete("token");
    url.searchParams.delete("refresh_token");
    url.searchParams.delete("access_token");
    url.searchParams.delete("email");
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl || window.location.pathname);
  }

  return email ? String(email).trim() : "";
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem(sessionStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredSession(session) {
  localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

function clearStoredSession() {
  localStorage.removeItem(sessionStorageKey);
}

function setServiceState(nextState, message) {
  state.serviceState = nextState;
  const banner = document.getElementById("service-banner");
  const title = document.getElementById("service-title");
  const copy = document.getElementById("service-message");
  if (!banner || !title || !copy) {
    return;
  }

  banner.dataset.state = nextState;
  if (nextState === "online") {
    title.textContent = "Dashboard service is live";
    copy.textContent = message || "You can sign in and access WaBro campaigns, broker lists, and Android device status.";
    return;
  }

  if (nextState === "degraded") {
    title.textContent = "Dashboard service is temporarily unavailable";
    copy.textContent = message || "The WaBro product page and APK download still work, but dashboard sign-in is blocked until the backend recovers.";
    return;
  }

  title.textContent = "Checking service status";
  copy.textContent = message || "Verifying whether the WaBro dashboard backend is available.";
}

function setLoginBusy(isBusy) {
  const submitButton = document.getElementById("login-submit-btn");
  if (!submitButton) return;
  submitButton.disabled = isBusy;
  submitButton.textContent = isBusy ? "Signing In..." : "Sign In";
}

function updateSessionCta() {
  const sessionCta = document.getElementById("session-cta");
  const sessionEmail = document.getElementById("session-email");
  const logoutButton = document.getElementById("logout-btn");
  const loginForm = document.getElementById("login-form");
  if (!sessionCta || !sessionEmail || !logoutButton || !loginForm) {
    return;
  }

  if (state.session?.token) {
    sessionEmail.textContent = state.user?.email || state.session.email || "";
    sessionCta.classList.remove("hidden");
    loginForm.classList.add("hidden");
    logoutButton.classList.remove("hidden");
    return;
  }

  sessionCta.classList.add("hidden");
  loginForm.classList.remove("hidden");
  logoutButton.classList.add("hidden");
}

async function refreshSessionIfNeeded() {
  const session = state.session;
  if (!session?.refreshToken || !session?.expiresAt || Date.now() < session.expiresAt - 5 * 60_000) {
    return;
  }

  const response = await fetch(`${apiBase}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken })
  });

  if (!response.ok) {
    throw new Error("Session expired");
  }

  const data = await response.json();
  const nextSession = {
    ...session,
    token: data?.session?.access_token,
    refreshToken: data?.session?.refresh_token || session.refreshToken,
    expiresAt: data?.session?.expires_in ? Date.now() + Number(data.session.expires_in) * 1000 : session.expiresAt
  };
  state.session = nextSession;
  saveStoredSession(nextSession);
}

async function apiFetch(path, options = {}) {
  await refreshSessionIfNeeded();
  const headers = {
    "Content-Type": "application/json",
    ...(state.session?.token ? { Authorization: `Bearer ${state.session.token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    logout();
    throw new Error("Session expired");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || data.message || "Request failed");
  }

  return response.json();
}

async function checkServiceHealth() {
  try {
    const response = await fetch(`${apiBase}/auth/me`, {
      headers: state.session?.token ? { Authorization: `Bearer ${state.session.token}` } : {}
    });

    if (response.status === 401 || response.ok) {
      setServiceState("online");
      return true;
    }

    if (response.status >= 500) {
      setServiceState("degraded");
      return false;
    }

    setServiceState("online");
    return true;
  } catch {
    setServiceState("degraded", "The dashboard backend is not reachable right now. You can still download the APK and review setup steps.");
    return false;
  }
}

function entityCard({ title, meta, body, tag }) {
  const card = document.createElement("article");
  card.className = "entity-card";
  card.innerHTML = `
    <div class="entity-tag">${tag}</div>
    <h4>${title}</h4>
    <p class="entity-meta">${meta}</p>
    <p class="entity-meta">${body}</p>
  `;
  return card;
}

function emptyState(title, text) {
  const card = document.createElement("article");
  card.className = "empty-state";
  card.innerHTML = `
    <div class="eyebrow">No data</div>
    <h4>${title}</h4>
    <p>${text}</p>
  `;
  return card;
}

function renderStats() {
  const statsRoot = document.getElementById("overview-stats");
  const template = document.getElementById("stat-card-template");
  if (!statsRoot || !template) return;

  const stats = state.stats || {
    total_campaigns: 0,
    total_sent: 0,
    total_failed: 0,
    total_skipped: 0,
    active_devices: 0,
    total_devices: 0
  };

  const cards = [
    ["Campaigns", stats.total_campaigns, "Campaigns in this workspace"],
    ["Sent", stats.total_sent, "Messages marked sent"],
    ["Failed", stats.total_failed, "Failed delivery attempts"],
    ["Skipped", stats.total_skipped, "Contacts skipped in sync logs"],
    ["Active Devices", stats.active_devices, "Polled in the last 5 minutes"],
    ["Broker Lists", state.contactLists.length, "Saved broadcast lists"]
  ];

  statsRoot.innerHTML = "";
  cards.forEach(([label, value, note]) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".stat-label").textContent = label;
    node.querySelector(".stat-value").textContent = value;
    node.querySelector(".stat-note").textContent = note;
    statsRoot.appendChild(node);
  });
}

function renderOverviewLists() {
  const campaignRoot = document.getElementById("recent-campaigns");
  const deviceRoot = document.getElementById("device-health");
  if (!campaignRoot || !deviceRoot) return;

  campaignRoot.innerHTML = "";
  deviceRoot.innerHTML = "";

  if (!state.campaigns.length) {
    campaignRoot.appendChild(emptyState("No campaigns yet", "Create a campaign from one of your saved broker lists."));
  } else {
    state.campaigns.slice(0, 8).forEach((campaign) => {
      const done = Number(campaign.sent_count || 0) + Number(campaign.failed_count || 0) + Number(campaign.skipped_count || 0);
      campaignRoot.appendChild(entityCard({
        title: campaign.name,
        meta: `${campaign.status} • ${done}/${campaign.total_contacts || 0} processed`,
        body: `Sent ${campaign.sent_count || 0} • Failed ${campaign.failed_count || 0} • Skipped ${campaign.skipped_count || 0}`,
        tag: campaign.created_at ? new Date(campaign.created_at).toLocaleDateString("en-IN") : "Campaign"
      }));
    });
  }

  const stats = state.stats;
  if (!stats?.total_devices) {
    deviceRoot.appendChild(emptyState("No devices registered", "Devices will appear once the Android client registers with the backend."));
  } else {
    deviceRoot.appendChild(entityCard({
      title: `${stats.active_devices} active of ${stats.total_devices}`,
      meta: "Live device count",
      body: "Detailed per-device metadata is not exposed by the current dashboard endpoint.",
      tag: "Android"
    }));
  }
}

function renderBrokerLists() {
  const root = document.getElementById("broker-list");
  if (!root) return;
  root.innerHTML = "";

  if (!state.contactLists.length) {
    root.appendChild(emptyState("No broker lists yet", "Import a broker list or add a broker manually into a named list."));
    return;
  }

  state.contactLists.forEach((list) => {
    root.appendChild(entityCard({
      title: list.name,
      meta: `${list.count} brokers`,
      body: "Reusable contact list for WaBro campaigns",
      tag: "List"
    }));
  });
}

function renderCampaignOptions() {
  const select = document.getElementById("campaign-contact-list-select");
  if (!select) return;
  select.innerHTML = `<option value="">Choose broker list</option>`;
  state.contactLists.forEach((list) => {
    const option = document.createElement("option");
    option.value = list.name;
    option.textContent = `${list.name} • ${list.count} brokers`;
    select.appendChild(option);
  });
}

function renderCampaigns() {
  const root = document.getElementById("campaign-list");
  if (!root) return;
  root.innerHTML = "";

  if (!state.campaigns.length) {
    root.appendChild(emptyState("No campaigns created", "Create a campaign from one of your imported broker lists."));
    return;
  }

  state.campaigns.forEach((campaign) => {
    const done = Number(campaign.sent_count || 0) + Number(campaign.failed_count || 0) + Number(campaign.skipped_count || 0);
    root.appendChild(entityCard({
      title: campaign.name,
      meta: `${campaign.status} • ${done}/${campaign.total_contacts || 0} processed`,
      body: `Sent ${campaign.sent_count || 0} • Failed ${campaign.failed_count || 0} • Skipped ${campaign.skipped_count || 0}`,
      tag: "Campaign"
    }));
  });
}

function renderDevices() {
  const root = document.getElementById("device-list");
  if (!root) return;
  root.innerHTML = "";

  const stats = state.stats;
  if (!stats?.total_devices) {
    root.appendChild(emptyState("No devices registered", "Open the WaBro Android client and connect it to this backend account."));
    return;
  }

  root.appendChild(entityCard({
    title: `${stats.total_devices} registered devices`,
    meta: `${stats.active_devices} active recently`,
    body: "This backend currently exposes device counts through dashboard stats, not full device cards.",
    tag: "Device"
  }));
}

function rerender() {
  renderStats();
  renderOverviewLists();
  renderBrokerLists();
  renderCampaignOptions();
  renderCampaigns();
  renderDevices();
  updateSessionCta();
}

async function loadDashboard() {
  const [me, dashboard, campaigns, lists] = await Promise.all([
    apiFetch("/auth/me"),
    apiFetch("/wabro/dashboard/stats"),
    apiFetch("/wabro/campaigns"),
    apiFetch("/wabro/contacts")
  ]);

  state.user = me?.user || me?.profile || null;
  state.stats = dashboard?.stats || null;
  state.campaigns = Array.isArray(campaigns?.campaigns) ? campaigns.campaigns : [];
  state.contactLists = Array.isArray(lists?.lists) ? lists.lists : [];

  document.getElementById("user-email").textContent = state.user?.email || state.session?.email || "";
  document.getElementById("session-email").textContent = state.user?.email || state.session?.email || "";
  setServiceState("online");
  rerender();
}

async function login(email, password) {
  const response = await fetch(`${apiBase}/auth/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "signin", email, password })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.session?.access_token) {
    if (response.status >= 500) {
      setServiceState("degraded");
      throw new Error("Login service is temporarily unavailable");
    }
    throw new Error(data?.error || data?.message || "Login failed");
  }

  state.session = {
    email: data?.user?.email || email,
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at
      ? data.session.expires_at * 1000
      : data.session.expires_in
        ? Date.now() + Number(data.session.expires_in) * 1000
        : undefined
  };
  saveStoredSession(state.session);
  updateSessionCta();
}

function showWorkspace() {
  document.getElementById("workspace-shell").classList.remove("hidden");
  document.getElementById("workspace-shell").scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideWorkspace() {
  document.getElementById("workspace-shell").classList.add("hidden");
}

function logout() {
  state.session = null;
  state.user = null;
  state.stats = null;
  state.campaigns = [];
  state.contactLists = [];
  state.contactsByList = new Map();
  clearStoredSession();
  hideWorkspace();
  updateSessionCta();
}

function activateSection(sectionId) {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.section === sectionId);
  });
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === sectionId);
  });
}

function parseBrokerBulkText(input) {
  return String(input || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", phone = "", locality = ""] = line.split(",").map((part) => part.trim());
      return { name, phone, locality };
    })
    .filter((broker) => broker.name && broker.phone);
}

function bindUi() {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => activateSection(button.dataset.section));
  });

  document.querySelectorAll("[data-open-form]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = document.getElementById(button.dataset.openForm);
      form.classList.toggle("hidden");
    });
  });

  document.getElementById("open-workspace-btn").addEventListener("click", showWorkspace);
  document.getElementById("close-workspace-btn").addEventListener("click", hideWorkspace);
  document.getElementById("logout-btn").addEventListener("click", logout);

  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    setLoginBusy(true);
    try {
      await login(String(form.get("email") || ""), String(form.get("password") || ""));
      await loadDashboard();
      showWorkspace();
    } catch (error) {
      errorEl.textContent = error.message || "Login failed";
    } finally {
      setLoginBusy(false);
    }
  });

  document.getElementById("broker-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const listName = String(form.get("list_name") || "").trim();
    const name = String(form.get("name") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const locality = String(form.get("locality") || "").trim();
    if (!listName || !name || !phone) return;

    await apiFetch("/wabro/contacts", {
      method: "POST",
      body: JSON.stringify({
        list_name: listName,
        contacts: [{ name, phone, locality }]
      })
    });

    event.currentTarget.reset();
    event.currentTarget.classList.add("hidden");
    await loadDashboard();
  });

  document.getElementById("broker-file").addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    document.getElementById("broker-bulk-input").value = await file.text();
  });

  document.getElementById("broker-import-btn").addEventListener("click", async () => {
    const form = document.getElementById("broker-form");
    const listName = String(new FormData(form).get("list_name") || "").trim();
    const input = document.getElementById("broker-bulk-input");
    const status = document.getElementById("broker-import-status");
    if (!listName) {
      status.textContent = "Enter a list name before importing.";
      return;
    }

    const contacts = parseBrokerBulkText(input.value);
    if (!contacts.length) {
      status.textContent = "No valid broker rows found to import.";
      return;
    }

    await apiFetch("/wabro/contacts", {
      method: "POST",
      body: JSON.stringify({
        list_name: listName,
        contacts
      })
    });

    input.value = "";
    document.getElementById("broker-file").value = "";
    status.textContent = `${contacts.length} brokers imported into ${listName}.`;
    await loadDashboard();
  });

  document.getElementById("campaign-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const listName = String(form.get("listName") || "").trim();
    const name = String(form.get("name") || "").trim();
    const messageTemplate = String(form.get("message_template") || "").trim();
    if (!listName || !name || !messageTemplate) return;

    let contacts = state.contactsByList.get(listName);
    if (!contacts) {
      const data = await apiFetch(`/wabro/contacts/${encodeURIComponent(listName)}`);
      contacts = Array.isArray(data?.contacts) ? data.contacts : [];
      state.contactsByList.set(listName, contacts);
    }

    await apiFetch("/wabro/campaigns", {
      method: "POST",
      body: JSON.stringify({
        name,
        message_template: messageTemplate,
        contacts: contacts.map((contact) => ({ phone: contact.phone, name: contact.name }))
      })
    });

    event.currentTarget.reset();
    event.currentTarget.classList.add("hidden");
    await loadDashboard();
  });
}

async function init() {
  bindUi();

  const emailFromQuery = consumeAuthQueryParams();
  if (emailFromQuery) {
    const emailInput = document.querySelector('#login-form input[name="email"]');
    if (emailInput) {
      emailInput.value = emailFromQuery;
    }
  }

  await checkServiceHealth();

  const stored = readStoredSession();
  if (!stored?.token) {
    updateSessionCta();
    return;
  }

  state.session = stored;
  updateSessionCta();

  try {
    await loadDashboard();
    showWorkspace();
  } catch {
    logout();
    setServiceState("degraded", "Stored session could not load the workspace. The dashboard backend may be unavailable right now.");
  }
}

init();
