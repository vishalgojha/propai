package com.chaoscraft.wablaster.service

import android.accessibilityservice.AccessibilityService
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.chaoscraft.wablaster.db.entities.Contact
import com.chaoscraft.wablaster.util.NodeIdConfig
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.random.Random

class WhatsAppAccessibilityService : AccessibilityService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var processingJob: Job? = null
    private var groupJob: Job? = null

    private val _currentState = MutableStateFlow<WaState>(WaState.Idle)
    val currentState: StateFlow<WaState> = _currentState.asStateFlow()

    private var ids: com.chaoscraft.wablaster.util.WaNodeIdSet = NodeIdConfig.forVersion("")

    override fun onCreate() {
        super.onCreate()
        val version = try {
            packageManager.getPackageInfo("com.whatsapp", 0).versionName ?: ""
        } catch (_: Exception) {
            try {
                packageManager.getPackageInfo("com.whatsapp.w4b", 0).versionName ?: ""
            } catch (_: Exception) { "" }
        }
        ids = NodeIdConfig.forVersion(version)
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        processingJob = serviceScope.launch {
            for (command in AccessibilityBridge.commandChannel) {
                val result = processCommand(command)
                AccessibilityBridge.resultChannel.send(result)
            }
        }
        groupJob = serviceScope.launch {
            for (command in AccessibilityBridge.groupCommandChannel) {
                val result = scrapeGroupParticipants(command)
                AccessibilityBridge.groupResultChannel.send(result)
            }
        }
    }

    private suspend fun processCommand(command: SendCommand): SendResult {
        var lastError: String? = null

        for (attempt in 0..2) {
            if (attempt > 0) {
                delay(30_000L)
                performGlobalAction(GLOBAL_ACTION_BACK)
                delay(2000)
            }

            try {
                _currentState.value = WaState.OpeningContact
                openContactViaDeepLink(command.contact.phone, command.senderPackage)
                if (!waitForChatScreen(10_000)) {
                    throw Exception("Chat screen did not open")
                }
                delay(1500)

                _currentState.value = WaState.InChat

                if (command.message.mediaUri != null) {
                    _currentState.value = WaState.AttachingMedia
                    attachMedia(command.message.mediaUri)
                    delay(2000)
                }

                _currentState.value = WaState.Typing
                typeMessage(command.message.body)

                _currentState.value = WaState.Sending
                if (!clickSendWithRetry(5_000)) {
                    throw Exception("Send button not found or not clickable")
                }
                delay(2000)

                _currentState.value = WaState.Idle

                performGlobalAction(GLOBAL_ACTION_BACK)
                delay(1500)
                performGlobalAction(GLOBAL_ACTION_BACK)
                delay(500)

                return SendResult(success = true, contact = command.contact, campaignId = command.campaignId)

            } catch (e: Exception) {
                lastError = e.message ?: "Unknown error"
                _currentState.value = WaState.Error(lastError!!)
            }
        }

        return SendResult(
            success = false,
            contact = command.contact,
            error = lastError ?: "Failed after 3 attempts",
            campaignId = command.campaignId
        )
    }

    private fun openContactViaDeepLink(phoneNumber: String, senderPackage: String = "com.whatsapp") {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("https://wa.me/$phoneNumber")
            `package` = senderPackage
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        applicationContext.startActivity(intent)
    }

    private suspend fun waitForChatScreen(timeoutMs: Long): Boolean {
        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < timeoutMs) {
            val inputNode = findNodeByViewId(ids.messageInput)
            if (inputNode != null) {
                inputNode.recycle()
                return true
            }
            val sendBtn = findNodeByViewId(ids.sendButton)
            if (sendBtn != null) {
                sendBtn.recycle()
                return true
            }
            delay(500)
        }
        return false
    }

    private suspend fun typeMessage(text: String) {
        val inputNode = findNodeByViewId(ids.messageInput)
            ?: findNodeByText("Type a message")
            ?: findNodeByText("Message")

        if (inputNode == null) {
            performGlobalAction(GLOBAL_ACTION_BACK)
            delay(1000)
            throw Exception("Message input field not found")
        }

        try {
            inputNode.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            delay(500)

            val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("msg", text))

            val args = Bundle().apply {
                putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, 0)
                putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, 0)
            }

            if (!inputNode.performAction(AccessibilityNodeInfo.ACTION_PASTE)) {
                inputNode.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                delay(300)
                inputNode.performAction(AccessibilityNodeInfo.ACTION_PASTE)
            }

            delay(Random.nextLong(800, 2000))
        } finally {
            inputNode.recycle()
        }
    }

    private suspend fun attachMedia(mediaUri: Uri) {
        val attachButton = findNodeByViewId(ids.attachButton)
            ?: throw Exception("Attach button not found")

        try {
            attachButton.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            delay(1500)

            val galleryOption = findNodeByViewId(ids.attachImageOption)
            val docOption = findNodeByViewId(ids.attachDocOption)

            val option = galleryOption ?: docOption
                ?: findNodeByText("Gallery")
                ?: findNodeByText("Documents")

            option?.let {
                it.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                it.recycle()
            }

            delay(500)

            MediaAttachment.result = null
            val trampolineIntent = Intent(this, MediaTrampolineActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                putExtra(MediaTrampolineActivity.EXTRA_MIME_TYPE, "image/*")
            }
            applicationContext.startActivity(trampolineIntent)

            val timeout = System.currentTimeMillis() + 60_000
            while (System.currentTimeMillis() < timeout) {
                if (MediaAttachment.result != null) break
                delay(200)
            }
        } finally {
            attachButton.recycle()
        }
    }

    private suspend fun clickSendWithRetry(timeoutMs: Long): Boolean {
        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < timeoutMs) {
            val sendButton = findNodeByViewId(ids.sendButton)
                ?: findNodeByText("Send")

            if (sendButton != null) {
                try {
                    if (sendButton.isEnabled) {
                        sendButton.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        return true
                    }
                } finally {
                    sendButton.recycle()
                }
            }
            delay(500)
        }
        return false
    }

    private suspend fun scrapeGroupParticipants(command: GroupContactCommand): GroupContactResult {
        _currentState.value = WaState.ReadingGroupParticipants
        try {
            performGlobalAction(GLOBAL_ACTION_BACK)
            delay(2000)

            val homeIntent = packageManager.getLaunchIntentForPackage(command.senderPackage)
            if (homeIntent != null) {
                homeIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                applicationContext.startActivity(homeIntent)
                delay(3000)
            }

            val searchMenuItem = findNodeByViewId(ids.searchMenuItem)
            if (searchMenuItem == null) {
                performGlobalAction(GLOBAL_ACTION_BACK)
                delay(1000)
                return GroupContactResult(error = "Search button not found")
            }
            try {
                searchMenuItem.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            } finally {
                searchMenuItem.recycle()
            }
            delay(2000)

            val searchInput = findNodeByViewId(ids.searchSrcText)
            if (searchInput == null) {
                return GroupContactResult(error = "Search input not found")
            }
            try {
                val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("group", command.groupName))

                searchInput.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                delay(300)
                searchInput.performAction(AccessibilityNodeInfo.ACTION_PASTE)
            } finally {
                searchInput.recycle()
            }
            delay(3000)

            val groupResult = findNodeByViewId(ids.contactRow)
                ?: findNodeByText(command.groupName)
            if (groupResult == null) {
                return GroupContactResult(error = "Group '${command.groupName}' not found")
            }
            try {
                groupResult.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            } finally {
                groupResult.recycle()
            }
            delay(4000)

            if (!waitForChatScreen(10_000)) {
                return GroupContactResult(error = "Group chat did not open")
            }
            delay(1500)

            val header = findNodeByViewId(ids.conversationHeaderName)
                ?: findNodeByText(command.groupName)
            if (header == null) {
                return GroupContactResult(error = "Group header not found")
            }
            try {
                header.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            } finally {
                header.recycle()
            }
            delay(3000)

            val contacts = mutableSetOf<Pair<String, String>>()
            val seenNames = mutableSetOf<String>()
            val seenScrollPositions = mutableSetOf<String>()

            for (scrollAttempt in 0..15) {
                val root = rootInActiveWindow ?: continue
                try {
                    val allNodes = mutableListOf<AccessibilityNodeInfo>()
                    collectAllNodes(root, allNodes)

                    val scrollHash = allNodes.joinToString("") { it.viewIdResourceName ?: "" }
                    if (seenScrollPositions.contains(scrollHash)) break
                    seenScrollPositions.add(scrollHash)

                    for (node in allNodes) {
                        val text = node.text?.toString()?.trim() ?: continue
                        if (text.length < 2 || text.length > 60) continue
                        if (text.contains("@") || text.startsWith("+")) continue
                        if (text.startsWith("http")) continue
                        if (text.matches(Regex("^[\\d,]+$"))) continue

                        val lower = text.lowercase()
                        if (lower in listOf(
                                "search", "home", "chats", "status", "calls",
                                "group info", "participants", "media", "links", "docs",
                                "exit group", "report group", "group settings",
                                "description", "created by", "you", "add participant",
                                "search…", "type a message", "message", "send"
                            ) || lower.startsWith("created") || lower.startsWith("add")) continue

                        if (!seenNames.contains(text)) {
                            seenNames.add(text)
                            val phoneNode = findPhoneNodeForName(root, node)
                            val phone = phoneNode?.text?.toString()?.trim() ?: ""
                            contacts.add(text to phone)
                        }
                    }
                } finally {
                    root.recycle()
                }

                scrollForward()
                delay(2000)
            }

            _currentState.value = WaState.Idle
            performGlobalAction(GLOBAL_ACTION_BACK)
            delay(1000)
            performGlobalAction(GLOBAL_ACTION_BACK)

            val contactList = contacts.mapIndexed { index, (name, phone) ->
                val phoneNumber = if (phone.matches(Regex("^[\\d+\\-\\s()]{7,20}$")))
                    phone.replace(Regex("[^\\d+]"), "")
                else ""
                Contact(phone = phoneNumber, name = name, campaignId = 0)
            }

            return GroupContactResult(contacts = contactList)

        } catch (e: Exception) {
            _currentState.value = WaState.Error(e.message ?: "Group scraping error")
            return GroupContactResult(error = e.message ?: "Group scraping error")
        }
    }

    private fun findPhoneNodeForName(root: AccessibilityNodeInfo, nameNode: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val parent = nameNode.parent ?: return null
        try {
            for (i in 0 until parent.childCount) {
                val child = parent.getChild(i) ?: continue
                val text = child.text?.toString()?.trim() ?: ""
                if (text.matches(Regex("^[\\d+\\-\\s()]{7,20}$")) ||
                    text.matches(Regex("^\\+\\d{10,15}$"))) {
                    return child
                }
                child.recycle()
            }
        } finally {
            parent.recycle()
        }
        return null
    }

    private fun collectAllNodes(root: AccessibilityNodeInfo, result: MutableList<AccessibilityNodeInfo>) {
        for (i in 0 until root.childCount) {
            val child = root.getChild(i) ?: continue
            result.add(child)
            collectAllNodes(child, result)
        }
    }



    private fun scrollForward() {
        val root = rootInActiveWindow ?: return
        try {
            val scrollable = findScrollableNode(root)
            scrollable?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
            scrollable?.recycle()
        } finally {
            root.recycle()
        }
    }

    private fun findScrollableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isScrollable) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val result = findScrollableNode(child)
            if (result != null) {
                child.recycle()
                return result
            }
            child.recycle()
        }
        return null
    }

    private fun findNodeByViewId(viewId: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        return try {
            val nodes = root.findAccessibilityNodeInfosByViewId(viewId)
            nodes?.firstOrNull()
        } finally {
            root.recycle()
        }
    }

    private fun findNodeByText(text: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        return try {
            val nodes = root.findAccessibilityNodeInfosByText(text)
            nodes?.firstOrNull { node ->
                node.text?.toString()?.equals(text, ignoreCase = true) == true ||
                    node.contentDescription?.toString()?.equals(text, ignoreCase = true) == true
            }
        } finally {
            root.recycle()
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.packageName?.startsWith("com.whatsapp") != true) return
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            serviceScope.launch {
                AccessibilityBridge.replyFlow.emit(event.text?.toString() ?: "")
            }
        }
    }

    override fun onInterrupt() {
        processingJob?.cancel()
        groupJob?.cancel()
    }

    override fun onDestroy() {
        super.onDestroy()
        processingJob?.cancel()
        groupJob?.cancel()
        serviceScope.cancel()
    }
}
