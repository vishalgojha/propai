package com.chaoscraft.wablaster.engine

import com.chaoscraft.wablaster.db.entities.CampaignResponse
import com.chaoscraft.wablaster.db.entities.SendLog

/**
 * Keyword-based intent detection for broker responses.
 * Scans response text for Indian real estate business keywords
 * and assigns a hot lead score + intent level.
 */
object ResponseClassifier {

    // High-intent keywords (Hindi + English + Hinglish)
    private val HOT_KEYWORDS = listOf(
        // English
        "interested", "interested", "visit", "site visit", "schedule visit",
        "show me", "send details", "send brochure", "rate card", "price list",
        "booking", "book", "commission", "brokerage rate", "what is rate",
        "call me", "please call", "contact me", "watsapp me", "send me",
        "project details", "floor plan", "emi", "emi calculator", "loan",
        "availability", "ready to move", "possession", "launching soon",
        "discount", "offer", "negotiable", "good deal",
        // Hindi
        "intereshta", "interesht", "dekhna", "dekhna chahta", "dekhna chahti",
        "site", "site dekhna", "rate", "kitna hai", "price", "booking",
        "commission", "brokerage", "call karo", "phone karo", "milna",
        "milana", "details bhejo", "brochure", "plan", "floor plan",
        "emi", "loan", "availability", "ready", "possession",
        "discount", "offer", "sasta", "best deal",
        // Hinglish
        "plz call", "pls call", "msg me", "msg karo", "watsapp karo",
        "detail send karo", "rate batao", "kitna cost", "budget hai",
        "project suna do", "interested hu", "dekhne aunga", "client hai",
        "referral", "refer", "recommend", "suggest"
    )

    // Medium-intent keywords
    private val WARM_KEYWORDS = listOf(
        "maybe", "let me check", "we will see", "discuss", "thinking",
        "share details", "information", "more info", "brochure",
        "yaar", "bhai", "dekhte hain", "sochta hu", "sochti hu",
        "baad mein", "kal call", "phone karunga", "puch raha", "puch rahi",
        "information chahiye", "details chahiye", "list de dijiye"
    )

    // Low-intent / polite decline keywords
    private val COLD_KEYWORDS = listOf(
        "no thanks", "not interested", "not now", "maybe later",
        "don't have", "nahi chahiye", "nahi hai", "not looking",
        "already booked", "already purchased", "do din baad",
        "abhi nahi", "kabhi nahi", "no need", "thanks"
    )

    /**
     * Classify a broker response and return a CampaignResponse with scoring.
     */
    fun classify(
        campaignId: Long,
        listingId: Long,
        brokerId: Long,
        brokerName: String,
        brokerPhone: String,
        responseText: String,
        responseTimeSec: Long
    ): CampaignResponse {
        val text = responseText.lowercase().trim()
        val hotScore = calculateScore(text, responseTimeSec)
        val intentLevel = when {
            hotScore >= 60 -> "HOT"
            hotScore >= 30 -> "WARM"
            else -> "COLD"
        }
        val responseType = detectResponseType(text)

        return CampaignResponse(
            campaignId = campaignId,
            listingId = listingId,
            brokerId = brokerId,
            brokerName = brokerName,
            brokerPhone = brokerPhone,
            responseText = responseText,
            responseType = responseType,
            hotLeadScore = hotScore,
            intentLevel = intentLevel,
            responseTimeSec = responseTimeSec
        )
    }

    private fun calculateScore(text: String, responseTimeSec: Long): Double {
        var score = 0.0

        // Keyword matching
        for (keyword in HOT_KEYWORDS) {
            if (text.contains(keyword)) {
                score += 25.0
                break
            }
        }
        for (keyword in WARM_KEYWORDS) {
            if (text.contains(keyword)) {
                score += 15.0
                break
            }
        }
        for (keyword in COLD_KEYWORDS) {
            if (text.contains(keyword)) {
                score -= 20.0
                break
            }
        }

        // Speed bonus: faster replies indicate higher interest
        score += when {
            responseTimeSec < 60 -> 15.0
            responseTimeSec < 300 -> 10.0
            responseTimeSec < 900 -> 5.0
            else -> 0.0
        }

        // Length heuristic: longer responses = more engaged
        when {
            text.length > 50 -> score += 5.0
            text.length > 100 -> score += 10.0
            text.length < 5 -> score -= 5.0 // one-word replies
        }

        // Question detection: questions show engagement
        if (text.contains("?") || text.contains("kya") || text.contains("kaise") || text.contains("kab")) {
            score += 5.0
        }

        // Number/price mention = high intent
        if (text.contains(Regex("\\d+(\\s*(lakh|crs|crore|₹|rs))"))) {
            score += 10.0
        }

        return score.coerceIn(0.0, 100.0)
    }

    private fun detectResponseType(text: String): String {
        val lower = text.lowercase()
        return when {
            lower.contains(Regex("(interested|dekhna|visit|site|want|book)")) -> "INTERESTED"
            lower.contains(Regex("(rate|price|kitna|cost|emi)")) -> "ASKED_PRICE"
            lower.contains(Regex("(visit|dekh|mil|call|phone|schedule)")) -> "WANT_VISIT"
            lower.contains(Regex("(commission|brokerage|cut|paisa)")) -> "ASKED_COMMISSION"
            lower.contains(Regex("(no|nahi|not|thanks|already)")) -> "OBJECTION"
            else -> "GENERAL_QUERY"
        }
    }
}

// Extension function for easy integration
fun String.classifyResponse(
    campaignId: Long, listingId: Long, brokerId: Long,
    brokerName: String, brokerPhone: String, responseTimeSec: Long
): CampaignResponse {
    return ResponseClassifier.classify(
        campaignId, listingId, brokerId, brokerName, brokerPhone, this, responseTimeSec
    )
}