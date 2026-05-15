package com.chaoscraft.wablaster.engine

import com.chaoscraft.wablaster.db.entities.CampaignResponse
import org.junit.Assert.*
import org.junit.Test

class ResponseClassifierTest {

    @Test
    fun `hot keywords - interested`() {
        val response = ResponseClassifier.classify(
            campaignId = 1, listingId = 1, brokerId = 1,
            brokerName = "Raj", brokerPhone = "9123456789",
            responseText = "I am interested in this property.",
            responseTimeSec = 30
        )

        assertEquals("HOT", response.intentLevel)
        assertTrue(response.hotLeadScore >= 25.0)
        assertEquals("INTERESTED", response.responseType)
    }

    @Test
    fun `hot keywords - want visit`() {
        val response = ResponseClassifier.classify(
            campaignId = 1, listingId = 1, brokerId = 1,
            brokerName = "Priya", brokerPhone = "9123456789",
            responseText = "Can I visit the site this weekend?",
            responseTimeSec = 60
        )

        assertEquals("HOT", response.intentLevel)
        assertEquals("WANT_VISIT", response.responseType)
    }

    @Test
    fun `hot keywords - asked commission`() {
        val response = ResponseClassifier.classify(
            campaignId = 1, listingId = 1, brokerId = 1,
            brokerName = "Amit", brokerPhone = "9123456789",
            responseText = "What is the brokerage rate?",
            responseTimeSec = 120
        )

        assertEquals("HOT", response.intentLevel)
        assertEquals("ASKED_COMMISSION", response.responseType)
    }

    @Test
    fun `hot keywords - hindi intereshta`() {
        val response = ResponseClassifier.classify(
            campaignId = 1, listingId = 1, brokerId = 1,
            brokerName = "Suresh", brokerPhone = "9123456789",
            responseText = "Mujhe bahut intereshta hai. Details bhejo.",
            responseTimeSec = 45
        )

        assertTrue("Hindi interest should score high", response.hotLeadScore >= 25.0)
    }

    @Test
    fun `cold keywords - not interested`() {
        val response = ResponseClassifier.classify(
            campaignId = 1, listingId = 1, brokerId = 1,
            brokerName = "Kumar", brokerPhone = "9123456789",
            responseText = "Not interested right now, thanks.",
            responseTimeSec = 600
        )

        assertEquals("COLD", response.intentLevel)
        assertTrue(response.hotLeadScore < 30.0)
    }

    @Test
    fun `warm keywords`() {
        val response = ResponseClassifier.classify(
            campaignId = 1, listingId = 1, brokerId = 1,
            brokerName = "Deepak", brokerPhone = "9123456789",
            responseText = "Let me check and discuss with my client.",
            responseTimeSec = 300
        )

        assertTrue("Should be warm or cold", response.intentLevel in listOf("WARM", "COLD"))
    }

    @Test
    fun `fast response gets bonus`() {
        val fastResponse = ResponseClassifier.classify(
            campaignId = 1, listingId = 1, brokerId = 1,
            brokerName = "Raj", brokerPhone = "9123456789",
            responseText = "Interested! Call me.",
            responseTimeSec = 10
        )

        val slowResponse = ResponseClassifier.classify(
            campaignId = 1, listingId = 1, brokerId = 1,
            brokerName = "Raj", brokerPhone = "9123456789",
            responseText = "Interested! Call me.",
            responseTimeSec = 1200
        )

        assertTrue("Fast response should score higher",
            fastResponse.hotLeadScore > slowResponse.hotLeadScore)
    }

    @Test
    fun `score bounded between 0 and 100`() {
        val response = ResponseClassifier.classify(
            campaignId = 1, listingId = 1, brokerId = 1,
            brokerName = "Raj", brokerPhone = "9123456789",
            responseText = "Interested! Call me! Visit now! Rate please! Book immediately! Extra discount best deal!",
            responseTimeSec = 5
        )

        assertTrue("Score should be <= 100", response.hotLeadScore <= 100.0)
        assertTrue("Score should be >= 0", response.hotLeadScore >= 0.0)
    }

    @Test
    fun `price mention boosts score`() {
        val withPrice = ResponseClassifier.classify(
            campaignId = 1, listingId = 1, brokerId = 1,
            brokerName = "Raj", brokerPhone = "9123456789",
            responseText = "Client has 1 Cr budget, interested in 2BHK",
            responseTimeSec = 60
        )

        val withoutPrice = ResponseClassifier.classify(
            campaignId = 1, listingId = 1, brokerId = 1,
            brokerName = "Raj", brokerPhone = "9123456789",
            responseText = "Client is interested in 2BHK",
            responseTimeSec = 60
        )

        assertTrue("Price mention should boost score",
            withPrice.hotLeadScore > withoutPrice.hotLeadScore)
    }
}