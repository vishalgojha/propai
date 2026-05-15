package com.chaoscraft.wablaster.util

object PaymentConfig {
    var upiId: String = "vishal.ojha-2@okicici"
    var upiName: String = "Vishal Ojha"
    var paymentAmount: String = "499"
    var paymentNote: String = "WaBro License"

    val upiUri: String
        get() = "upi://pay?pa=$upiId&pn=${upiName}&am=$paymentAmount&cu=INR&tn=$paymentNote"

    fun isConfigured(): Boolean {
        return upiId.contains("@") && !upiId.startsWith("yourname")
    }
}
