package com.chaoscraft.wablaster.ui

import android.Manifest
import android.content.ContentResolver
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chaoscraft.wablaster.campaign.CsvImporter
import com.chaoscraft.wablaster.db.daos.BroadcastListContactDao
import com.chaoscraft.wablaster.db.daos.BroadcastListDao
import com.chaoscraft.wablaster.db.entities.BroadcastList
import com.chaoscraft.wablaster.db.entities.BroadcastListContact
import com.chaoscraft.wablaster.db.entities.Contact
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BroadcastListsScreen(
    broadcastListDao: BroadcastListDao,
    broadcastListContactDao: BroadcastListContactDao,
    csvImporter: CsvImporter,
    onSelectList: (List<Contact>) -> Unit
) {
    val lists by broadcastListDao.getAllFlow().collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var showCreateDialog by remember { mutableStateOf(false) }
    var selectedList by remember { mutableStateOf<BroadcastList?>(null) }
    var listContacts by remember { mutableStateOf<List<BroadcastListContact>>(emptyList()) }
    val smartListContext = androidx.compose.ui.platform.LocalContext.current
    var showSmartListDialog by remember { mutableStateOf(false) }
    var showGroupImportInfo by remember { mutableStateOf(false) }

    val csvPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        uri?.let {
            val listId = selectedList!!.id
            scope.launch {
                val result = csvImporter.import(it, 0)
                val contacts = result.contacts.map { c ->
                    BroadcastListContact(listId = listId, phone = c.phone, name = c.name)
                }
                broadcastListContactDao.insertAll(contacts)
                broadcastListDao.updateContactCount(listId)
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "Broadcast Lists",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = { showGroupImportInfo = true }) {
                    Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Group")
                }
                FilledTonalButton(onClick = { showSmartListDialog = true }) {
                    Icon(Icons.Default.AutoAwesome, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Smart")
                }
                FilledTonalButton(onClick = { showCreateDialog = true }) {
                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("New")
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        if (lists.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Default.Contacts,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        "No broadcast lists yet",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        "Create a list to reuse across campaigns",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                }
            }
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(lists, key = { it.id }) { list ->
                    ListCard(
                        list = list,
                        onView = {
                            selectedList = list
                            scope.launch {
                                listContacts = broadcastListContactDao.getByListSync(list.id)
                            }
                        },
                        onUse = {
                            scope.launch {
                                val contacts = broadcastListContactDao.getByListSync(list.id)
                                onSelectList(contacts.map { Contact(phone = it.phone, name = it.name, locality = it.locality, budget = it.budget, language = it.language) })
                            }
                        },
                        onDelete = {
                            scope.launch {
                                broadcastListContactDao.deleteByList(list.id)
                                broadcastListDao.delete(list)
                            }
                        }
                    )
                }
            }
        }
    }

    if (showCreateDialog) {
        CreateListDialog(
            onDismiss = { showCreateDialog = false },
            onCreate = { name ->
                scope.launch {
                    broadcastListDao.insert(BroadcastList(name = name))
                }
                showCreateDialog = false
            }
        )
    }

    if (showSmartListDialog) {
        SmartListDialog(
            onDismiss = { showSmartListDialog = false },
            onCreate = { name, keywords ->
                scope.launch {
                    val allFiltered = smartFilterContacts(context = smartListContext, keywords)
                    val chunks = allFiltered.chunked(100)
                    if (chunks.isEmpty()) {
                        broadcastListDao.insert(BroadcastList(name = name))
                    } else {
                        chunks.forEachIndexed { index, chunk ->
                            val listName = if (chunks.size == 1) name else "$name (${index + 1})"
                            val id = broadcastListDao.insert(BroadcastList(name = listName))
                            val contacts = chunk.map {
                                BroadcastListContact(listId = id, phone = it.normalizedPhone, name = it.name)
                            }
                            broadcastListContactDao.insertAll(contacts)
                            broadcastListDao.updateContactCount(id)
                        }
                    }
                }
                showSmartListDialog = false
            }
        )
    }

    if (showGroupImportInfo) {
        GroupImportUnavailableDialog(
            onDismiss = { showGroupImportInfo = false }
        )
    }

    selectedList?.let { list ->
        if (listContacts.isNotEmpty() || true) {
            ListDetailSheet(
                list = list,
                contacts = listContacts,
                onDismiss = { selectedList = null; listContacts = emptyList() },
                onImportCsv = {
                    csvPicker.launch(arrayOf("text/*", "*/*"))
                },
                onImportFromGroup = {
                    showGroupImportInfo = true
                },
                onRemoveContact = { contact ->
                    scope.launch {
                        broadcastListContactDao.deleteContact(list.id, contact.phone)
                        listContacts = broadcastListContactDao.getByListSync(list.id)
                        broadcastListDao.updateContactCount(list.id)
                    }
                },
                broadcastListContactDao = broadcastListContactDao,
                broadcastListDao = broadcastListDao
            )
        }
    }
}

@Composable
private fun ListCard(
    list: BroadcastList,
    onView: () -> Unit,
    onUse: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.People,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(40.dp)
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(list.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    "${list.contactCount} contacts",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            IconButton(onClick = onView) {
                Icon(Icons.Default.Visibility, contentDescription = "View")
            }
            IconButton(onClick = onUse) {
                Icon(Icons.Default.Send, contentDescription = "Use in Campaign")
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun CreateListDialog(
    onDismiss: () -> Unit,
    onCreate: (String) -> Unit
) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Default.People, contentDescription = null) },
        title = { Text("New Broadcast List") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("List Name") },
                placeholder = { Text("e.g., Real Estate Leads") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            TextButton(onClick = { onCreate(name) }, enabled = name.isNotBlank()) {
                Text("Create")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ListDetailSheet(
    list: BroadcastList,
    contacts: List<BroadcastListContact>,
    onDismiss: () -> Unit,
    onImportCsv: () -> Unit,
    onImportFromGroup: () -> Unit,
    onRemoveContact: (BroadcastListContact) -> Unit,
    broadcastListContactDao: BroadcastListContactDao,
    broadcastListDao: BroadcastListDao
) {
    var showContactPicker by remember { mutableStateOf(false) }
    var showManualAdd by remember { mutableStateOf(false) }
    var manualName by remember { mutableStateOf("") }
    var manualPhone by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    if (showContactPicker) {
        ContactPickerDialog(
            onDismiss = { showContactPicker = false },
            onContactsSelected = { selected ->
                scope.launch {
                    val contacts = selected.map { BroadcastListContact(listId = list.id, phone = it.phone, name = it.name) }
                    broadcastListContactDao.insertAll(contacts)
                    broadcastListDao.updateContactCount(list.id)
                }
                showContactPicker = false
            }
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(list.name, fontWeight = FontWeight.Bold)
                Text("${contacts.size}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        text = {
            Column {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onImportCsv, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Default.UploadFile, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("CSV")
                    }
                    OutlinedButton(onClick = { showContactPicker = true }, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Default.Contacts, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Phonebook")
                    }
                    OutlinedButton(onClick = onImportFromGroup, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Group")
                    }
                }
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = { showManualAdd = !showManualAdd }) {
                    Icon(Icons.Default.PersonAdd, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(if (showManualAdd) "Cancel Manual Add" else "Manual Add")
                }
                if (showManualAdd) {
                    Spacer(Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        OutlinedTextField(
                            value = manualName,
                            onValueChange = { manualName = it },
                            label = { Text("Name") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = manualPhone,
                            onValueChange = { manualPhone = it },
                            label = { Text("Phone") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(onClick = {
                            if (manualPhone.isNotBlank()) {
                                scope.launch {
                                    broadcastListContactDao.insert(BroadcastListContact(listId = list.id, phone = manualPhone, name = manualName))
                                    broadcastListDao.updateContactCount(list.id)
                                }
                                manualName = ""
                                manualPhone = ""
                            }
                        }, enabled = manualPhone.isNotBlank()) {
                            Icon(Icons.Default.Add, contentDescription = "Add")
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                if (contacts.isEmpty()) {
                    Text("No contacts yet. Import from CSV or phonebook.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    LazyColumn(modifier = Modifier.heightIn(max = 300.dp)) {
                        items(contacts, key = { it.phone }) { contact ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Person, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                Spacer(Modifier.width(8.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(contact.name, style = MaterialTheme.typography.bodyMedium)
                                    Text(contact.phone, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                IconButton(onClick = { onRemoveContact(contact) }, modifier = Modifier.size(32.dp)) {
                                    Icon(Icons.Default.Close, contentDescription = "Remove", modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Done") }
        }
    )
}

@Composable
private fun SmartListDialog(
    onDismiss: () -> Unit,
    onCreate: (name: String, keywords: List<String>) -> Unit
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var keywordsText by remember { mutableStateOf("") }
    var previewContacts by remember { mutableStateOf<List<PhoneContact>>(emptyList()) }
    var showPreview by remember { mutableStateOf(false) }

    val parsedKeywords = remember(keywordsText) {
        keywordsText.split(",", "،", "|")
            .map { it.trim() }
            .filter { it.isNotBlank() }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Default.AutoAwesome, contentDescription = null) },
        title = { Text("Smart List") },
        text = {
            Column {
                Text(
                    "Enter keywords to auto-find matching contacts from your phonebook:",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = keywordsText,
                    onValueChange = { keywordsText = it },
                    label = { Text("Keywords") },
                    placeholder = { Text("agent, broker, bkr, ea") },
                    supportingText = { Text("Comma-separated. Matches contact names.") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                if (parsedKeywords.isNotEmpty()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${parsedKeywords.size} keyword${if (parsedKeywords.size > 1) "s" else ""}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.width(8.dp))
                        TextButton(onClick = {
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
                                previewContacts = smartFilterContacts(context, parsedKeywords)
                                showPreview = true
                            }
                        }) { Text("Preview") }
                    }
                    if (showPreview) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "${previewContacts.size} contacts match",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val name = "Smart: ${parsedKeywords.take(3).joinToString(", ")}"
                    onCreate(name, parsedKeywords)
                },
                enabled = parsedKeywords.isNotEmpty()
            ) { Text("Create List") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
private fun GroupImportUnavailableDialog(
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Default.People, contentDescription = null) },
        title = { Text("Group Import Unavailable") },
        text = {
            Column {
                Text(
                    "Group import still depends on the old on-device accessibility flow and is disabled in backend delivery mode.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Use CSV import, phonebook import, or manual add for now. Backend group sync can be added later through server APIs.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("OK") }
        }
    )
}

private fun smartFilterContacts(context: android.content.Context, keywords: List<String>): List<PhoneContact> {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
        return emptyList()
    }
    val all = loadContacts(context.contentResolver)
    return all.filter { contact ->
        val name = contact.name.lowercase()
        keywords.any { keyword -> name.contains(keyword.trim().lowercase()) }
    }
}
