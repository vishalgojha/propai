package com.chaoscraft.wablaster.campaign

import android.content.Context
import android.net.Uri
import com.chaoscraft.wablaster.db.entities.Contact
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

data class CsvImportResult(
    val contacts: List<Contact>,
    val errors: List<String>,
    val totalRows: Int
)

@Singleton
class CsvImporter @Inject constructor(
    @ApplicationContext private val context: Context
) {

    fun import(uri: Uri, campaignId: Long): CsvImportResult {
        val contacts = mutableListOf<Contact>()
        val errors = mutableListOf<String>()
        var totalRows = 0
        val seenPhones = mutableSetOf<String>()

        try {
            val inputStream = context.contentResolver.openInputStream(uri)
            inputStream?.bufferedReader()?.use { reader ->
                val headerLine = reader.readLine() ?: return CsvImportResult(emptyList(), listOf("Empty CSV"), 0)
                val columns = parseCsvLine(headerLine)
                val phoneIdx = columns.indexOfFirst { it.equals("phone", true) }
                val nameIdx = columns.indexOfFirst { it.equals("name", true) }

                if (phoneIdx == -1) {
                    return CsvImportResult(emptyList(), listOf("Missing 'phone' column"), 0)
                }
                if (nameIdx == -1) {
                    return CsvImportResult(emptyList(), listOf("Missing 'name' column"), 0)
                }

                val localityIdx = columns.indexOfFirst { it.equals("locality", true) }
                val budgetIdx = columns.indexOfFirst { it.equals("budget", true) }
                val languageIdx = columns.indexOfFirst { it.equals("language", true) }

                reader.forEachLine { line ->
                    totalRows++
                    if (line.isBlank()) return@forEachLine

                    val values = parseCsvLine(line)
                    val phone = values.getOrNull(phoneIdx)?.trim() ?: ""
                    val name = values.getOrNull(nameIdx)?.trim() ?: ""

                    if (phone.isBlank()) {
                        errors.add("Row $totalRows: missing phone")
                        return@forEachLine
                    }
                    if (!phone.all { it.isDigit() }) {
                        errors.add("Row $totalRows: non-numeric phone '$phone'")
                        return@forEachLine
                    }
                    if (seenPhones.contains(phone)) {
                        errors.add("Row $totalRows: duplicate phone '$phone'")
                        return@forEachLine
                    }
                    if (name.isBlank()) {
                        errors.add("Row $totalRows: missing name")
                        return@forEachLine
                    }

                    seenPhones.add(phone)
                    contacts.add(
                        Contact(
                            phone = phone,
                            name = name,
                            locality = values.getOrNull(localityIdx)?.trim(),
                            budget = values.getOrNull(budgetIdx)?.trim(),
                            language = values.getOrNull(languageIdx)?.trim()?.take(2),
                            campaignId = campaignId,
                            sent = false
                        )
                    )
                }
            }
        } catch (e: Exception) {
            errors.add("Read error: ${e.message}")
        }

        return CsvImportResult(contacts, errors, totalRows)
    }

    private fun parseCsvLine(line: String): List<String> {
        val result = mutableListOf<String>()
        val current = StringBuilder()
        var inQuotes = false

        for (char in line) {
            when {
                char == '"' -> inQuotes = !inQuotes
                char == ',' && !inQuotes -> {
                    result.add(current.toString())
                    current.clear()
                }
                else -> current.append(char)
            }
        }
        result.add(current.toString())
        return result
    }
}
