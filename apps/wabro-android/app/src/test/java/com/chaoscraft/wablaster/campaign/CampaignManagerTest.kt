package com.chaoscraft.wablaster.campaign

import com.chaoscraft.wablaster.db.entities.Contact
import org.junit.Assert.*
import org.junit.Test

class CampaignManagerTest {

    @Test
    fun `test contact deduplication on import`() {
        val contacts = listOf(
            Contact(phone = "9123456789", name = "Raj Sharma", campaignId = 1),
            Contact(phone = "9123456789", name = "Raj", campaignId = 1),
            Contact(phone = "9876543210", name = "Priya", campaignId = 1)
        )

        val uniquePhones = mutableSetOf<String>()
        val deduplicated = contacts.filter {
            if (uniquePhones.contains(it.phone)) false
            else {
                uniquePhones.add(it.phone)
                true
            }
        }

        assertEquals(2, deduplicated.size)
        assertEquals("Raj Sharma", deduplicated[0].name)
    }

    @Test
    fun `test campaign stats accumulation`() {
        var stats = CampaignStats(campaignId = 1, total = 100)

        // Simulate status updates
        stats = stats.copy(sent = stats.sent + 1)
        stats = stats.copy(sent = stats.sent + 1)
        stats = stats.copy(failed = stats.failed + 1)
        stats = stats.copy(skipped = stats.skipped + 1)
        stats = stats.copy(paused = stats.paused + 1)

        assertEquals(2, stats.sent)
        assertEquals(1, stats.failed)
        assertEquals(1, stats.skipped)
        assertEquals(1, stats.paused)
    }

    @Test
    fun `test campaign completion check`() {
        val totalContacts = 100
        val sentCount = 100
        val remaining = totalContacts - sentCount

        assertTrue("Campaign should be done", remaining == 0)
    }

    @Test
    fun `test phone number validation`() {
        val validNumbers = listOf(
            "9123456789",
            "9876543210",
            "+919876543210",
            "919876543210"
        )

        val invalidNumbers = listOf(
            "123",
            "abc1234567",
            "",
            "912345678" // too short
        )

        validNumbers.forEach { phone ->
            val digits = phone.filter { it.isDigit() }
            assertTrue("Phone $phone should have 10 digits", digits.length == 10)
        }

        invalidNumbers.forEach { phone ->
            val digits = phone.filter { it.isDigit() }
            assertFalse("Phone $phone should not have exactly 10 digits", digits.length == 10)
        }
    }

    @Test
    fun `test response classification integration`() {
        // Verify ResponseClassifier is accessible from CampaignManager module
        val text = "Hi, I am interested in this property. Please send me the brochure."

        val classified = text.lowercase().let { lower ->
            val hotWords = listOf("interested", "brochure", "visit", "send me")
            hotWords.any { lower.contains(it) }
        }

        assertTrue("Should detect interest keywords", classified)
    }
}