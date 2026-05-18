const DEBUG_PREFIX = '[WhatsAppPresence]';
const HEARTBEAT_MS = 60_000;
const STALLED_AFTER_MS = 120_000;

type PresenceStatus = 'connected' | 'loading' | 'qr_required' | 'disconnected' | 'active' | 'stalled';
type PresenceEventType =
	| 'session_connected'
	| 'session_disconnected'
	| 'qr_visible'
	| 'chat_list_loaded'
	| 'presence_signal_seen'
	| 'web_client_stalled';

type PresenceSnapshot = {
	status: PresenceStatus;
	eventType: PresenceEventType;
	url: string;
	selectedChatTitle?: string | null;
	domFlags: Record<string, boolean>;
};

function getBodyText() {
	return String(document.body?.innerText || '').slice(0, 8000);
}

function bool(value: Element | null | undefined) {
	return Boolean(value);
}

function detectSnapshot(): PresenceSnapshot {
	const bodyText = getBodyText();
	const hasSidebar = bool(document.querySelector('#pane-side, [data-testid="chat-list"]'));
	const hasComposer = bool(document.querySelector('footer [contenteditable="true"], [contenteditable="true"][data-tab]'));
	const hasProgress = bool(document.querySelector('[role="progressbar"]'));
	const hasQrCanvas = bool(document.querySelector('canvas[aria-label], div[data-ref] canvas, [data-testid="qrcode"] canvas'));
	const hasQrText = /scan this qr code|link with phone number|use whatsapp on your phone/i.test(bodyText);
	const hasReconnectText = /trying to reach phone|keep your phone connected|reconnect now|phone not connected/i.test(bodyText);
	const selectedChatTitle =
		document.querySelector('header [title]')?.getAttribute('title')
		|| document.querySelector('[data-testid="conversation-info-header-chat-title"]')?.textContent
		|| null;

	const domFlags = {
		hasSidebar,
		hasComposer,
		hasProgress,
		hasQrCanvas,
		hasQrText,
		hasReconnectText,
		hasSelectedChat: Boolean(selectedChatTitle),
	};

	if ((hasQrCanvas || hasQrText) && !hasSidebar) {
		return { status: 'qr_required', eventType: 'qr_visible', url: window.location.href, selectedChatTitle, domFlags };
	}

	if (hasReconnectText) {
		return { status: 'disconnected', eventType: 'session_disconnected', url: window.location.href, selectedChatTitle, domFlags };
	}

	if (hasSidebar && hasComposer) {
		return { status: 'connected', eventType: 'session_connected', url: window.location.href, selectedChatTitle, domFlags };
	}

	if (hasSidebar) {
		return { status: 'active', eventType: 'chat_list_loaded', url: window.location.href, selectedChatTitle, domFlags };
	}

	return { status: hasProgress ? 'loading' : 'loading', eventType: 'presence_signal_seen', url: window.location.href, selectedChatTitle, domFlags };
}

function postPresenceEvent(snapshot: PresenceSnapshot, observedAt: string) {
	chrome.runtime.sendMessage({
		type: 'WHATSAPP_PRESENCE_EVENT',
		payload: {
			eventType: snapshot.eventType,
			status: snapshot.status,
			url: snapshot.url,
			observedAt,
			metadata: {
				selectedChatTitle: snapshot.selectedChatTitle,
				domFlags: snapshot.domFlags,
			},
		},
	}, (response) => {
		if (chrome.runtime.lastError) {
			console.debug(DEBUG_PREFIX, 'presence event send skipped', chrome.runtime.lastError.message)
			return
		}

		if (response?.error) {
			console.debug(DEBUG_PREFIX, 'presence event rejected', response.error)
		}
	})
}

export function initWhatsAppPresenceObserver() {
	if (window.location.hostname !== 'web.whatsapp.com') {
		return
	}

	let lastStatus: PresenceStatus | null = null
	let lastHeartbeatAt = 0
	let statusSince = Date.now()

	const emitSnapshot = (forceHeartbeat = false) => {
		const snapshot = detectSnapshot()
		const now = Date.now()
		const statusChanged = snapshot.status !== lastStatus

		if (statusChanged) {
			statusSince = now
		}

		let outbound = snapshot
		if (!statusChanged && snapshot.status === 'loading' && now - statusSince >= STALLED_AFTER_MS) {
			outbound = { ...snapshot, status: 'stalled', eventType: 'web_client_stalled' }
		}

		const shouldHeartbeat = forceHeartbeat || now - lastHeartbeatAt >= HEARTBEAT_MS
		if (!statusChanged && !shouldHeartbeat && outbound.eventType !== 'web_client_stalled') {
			return
		}

		lastStatus = outbound.status
		lastHeartbeatAt = now
		postPresenceEvent(outbound, new Date(now).toISOString())
	}

	const observer = new MutationObserver(() => {
		window.requestAnimationFrame(() => emitSnapshot(false))
	})

	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
		attributes: true,
		characterData: false,
	})

	window.addEventListener('focus', () => emitSnapshot(true))
	window.addEventListener('online', () => emitSnapshot(true))
	window.addEventListener('offline', () => emitSnapshot(true))
	window.setInterval(() => emitSnapshot(true), HEARTBEAT_MS)

	console.debug(DEBUG_PREFIX, 'observer started on WhatsApp Web')
	emitSnapshot(true)
}
