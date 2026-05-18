import { handlePageControlMessage } from '@/agent/RemotePageController.background'
import { handleTabControlMessage, setupTabEventsPort } from '@/agent/TabsController.background'

export default defineBackground(() => {
	console.log('[Background] Service Worker started')

	// tab change events

	setupTabEventsPort()

	// generate user auth token

	chrome.storage.local.get('PageAgentExtUserAuthToken').then((result) => {
		if (result.PageAgentExtUserAuthToken) return

		const userAuthToken = crypto.randomUUID()
		chrome.storage.local.set({ PageAgentExtUserAuthToken: userAuthToken })
	})

	// message proxy

	chrome.runtime.onMessage.addListener((message, sender, sendResponse): true | undefined => {
		if (message.type === 'TAB_CONTROL') {
			return handleTabControlMessage(message, sender, sendResponse)
		} else if (message.type === 'PAGE_CONTROL') {
			return handlePageControlMessage(message, sender, sendResponse)
		} else if (message.type === 'WHATSAPP_PRESENCE_EVENT') {
			void forwardWhatsAppPresenceEvent(message.payload, sender.tab?.id).then(
				() => sendResponse({ ok: true }),
				(error) => sendResponse({ error: error instanceof Error ? error.message : 'presence event forward failed' })
			)
			return true
		} else {
			sendResponse({ error: 'Unknown message type' })
			return
		}
	})

	// external messages (from localhost launcher page via externally_connectable)

	chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
		if (message.type === 'OPEN_HUB') {
			openOrFocusHubTab(message.wsPort).then(() => {
				if (sender.tab?.id) chrome.tabs.remove(sender.tab.id)
				sendResponse({ ok: true })
			})
			return true
		}
	})

	// setup

	chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})

async function openOrFocusHubTab(wsPort: number) {
	const hubUrl = chrome.runtime.getURL('hub.html')
	const existing = await chrome.tabs.query({ url: `${hubUrl}*` })

	if (existing.length > 0 && existing[0].id) {
		await chrome.tabs.update(existing[0].id, {
			active: true,
			url: `${hubUrl}?ws=${wsPort}`,
		})
		return
	}

	await chrome.tabs.create({ url: `${hubUrl}?ws=${wsPort}`, pinned: true })
}

async function forwardWhatsAppPresenceEvent(payload: any, tabId?: number) {
	const config = await chrome.storage.local.get([
		'propaiPresenceApiBaseUrl',
		'propaiPresenceAuthToken',
		'propaiPresenceSessionLabel',
		'propaiPresenceSource',
	])

	const authToken = String(config.propaiPresenceAuthToken || '').trim()
	if (!authToken) {
		throw new Error('propaiPresenceAuthToken is not configured in extension storage')
	}

	const apiBaseUrl = String(config.propaiPresenceApiBaseUrl || 'https://api.propai.live/api').replace(/\/+$/, '')
	const sessionLabel = String(payload?.sessionLabel || config.propaiPresenceSessionLabel || '').trim()
	const body = {
		sessionLabel: sessionLabel || null,
		source: String(config.propaiPresenceSource || 'page-agent-extension'),
		eventType: String(payload?.eventType || 'presence_signal_seen'),
		status: String(payload?.status || 'unknown'),
		url: typeof payload?.url === 'string' ? payload.url : null,
		tabId: typeof tabId === 'number' ? String(tabId) : null,
		observedAt: typeof payload?.observedAt === 'string' ? payload.observedAt : new Date().toISOString(),
		metadata: payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
	}

	const response = await fetch(`${apiBaseUrl}/whatsapp/presence/events`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${authToken}`,
		},
		body: JSON.stringify(body),
	})

	if (!response.ok) {
		const text = await response.text().catch(() => '')
		throw new Error(text || `presence event forward failed with status ${response.status}`)
	}
}
