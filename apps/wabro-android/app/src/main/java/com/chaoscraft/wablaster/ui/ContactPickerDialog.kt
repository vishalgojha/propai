package com.chaoscraft.wablaster.ui

import android.Manifest
import android.content.ContentResolver
import android.content.pm.PackageManager
import android.database.Cursor
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.chaoscraft.wablaster.db.entities.Contact

data class PhoneContact(val name: String, val phone: String, val normalizedPhone: String)

@Composable
fun ContactPickerDialog(
    onDismiss: () -> Unit,
    onContactsSelected: (List<Contact>) -> Unit
) {
    val context = LocalContext.current
    var hasPermission by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED)
    }
    var allContacts by remember { mutableStateOf<List<PhoneContact>>(emptyList()) }
    var selectedPhones by remember { mutableStateOf(emptySet<String>()) }
    var searchQuery by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasPermission = granted
        if (granted) {
            isLoading = true
            allContacts = loadContacts(context.contentResolver)
            isLoading = false
        }
    }

    LaunchedEffect(hasPermission) {
        if (hasPermission && allContacts.isEmpty()) {
            isLoading = true
            allContacts = loadContacts(context.contentResolver)
            isLoading = false
        }
    }

    val filtered = remember(allContacts, searchQuery) {
        if (searchQuery.isBlank()) allContacts
        else allContacts.filter {
            it.name.contains(searchQuery, ignoreCase = true) ||
            it.phone.contains(searchQuery)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Select Contacts", fontWeight = FontWeight.Bold)
                if (selectedPhones.isNotEmpty()) {
                    Text(
                        text = "${selectedPhones.size} selected",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        },
        text = {
            Column(modifier = Modifier.heightIn(max = 480.dp)) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    label = { Text("Search") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                Spacer(Modifier.height(8.dp))

                if (!hasPermission) {
                    Text(
                        "Contact permission required. Tap Allow to proceed.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { permissionLauncher.launch(Manifest.permission.READ_CONTACTS) },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Grant Permission") }
                } else if (isLoading) {
                    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else if (filtered.isEmpty()) {
                    Text("No contacts found", style = MaterialTheme.typography.bodyMedium)
                } else {
                    LazyColumn(modifier = Modifier.fillMaxWidth()) {
                        items(filtered, key = { it.normalizedPhone }) { contact ->
                            val isSelected = contact.normalizedPhone in selectedPhones
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Checkbox(
                                    checked = isSelected,
                                    onCheckedChange = { checked ->
                                        selectedPhones = if (checked) selectedPhones + contact.normalizedPhone
                                        else selectedPhones - contact.normalizedPhone
                                    }
                                )
                                Column(modifier = Modifier.padding(start = 8.dp)) {
                                    Text(contact.name, style = MaterialTheme.typography.bodyLarge)
                                    Text(
                                        contact.phone,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val selected = allContacts
                        .filter { it.normalizedPhone in selectedPhones }
                        .map { Contact(phone = it.normalizedPhone, name = it.name) }
                    onContactsSelected(selected)
                    onDismiss()
                },
                enabled = selectedPhones.isNotEmpty()
            ) { Text("Add (${selectedPhones.size})") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

fun loadContacts(resolver: ContentResolver): List<PhoneContact> {
    val list = mutableListOf<PhoneContact>()
    val seen = mutableSetOf<String>()
    val uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
    val projection = arrayOf(
        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
        ContactsContract.CommonDataKinds.Phone.NUMBER,
        ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER
    )
    val sort = "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
    var cursor: Cursor? = null
    try {
        cursor = resolver.query(uri, projection, null, null, sort)
        cursor?.use { c ->
            val nameIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
            val numIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
            val normIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER)
            while (c.moveToNext()) {
                val name = c.getString(nameIdx) ?: "Unknown"
                val rawPhone = c.getString(numIdx)?.filter { it.isDigit() } ?: continue
                val normalized = c.getString(normIdx)?.filter { it.isDigit() }
                    ?: if (rawPhone.length == 10) "91$rawPhone" else rawPhone
                if (normalized !in seen) {
                    seen.add(normalized)
                    list.add(PhoneContact(name = name, phone = rawPhone, normalizedPhone = normalized))
                }
            }
        }
    } catch (_: SecurityException) {
    } finally {
        cursor?.close()
    }
    return list
}
