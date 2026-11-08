package com.mobu.app

import android.app.Activity
import android.os.Bundle
import android.text.method.LinkMovementMethod
import android.view.ViewGroup
import android.widget.ScrollView
import android.widget.TextView

/**
 * Health Connect requires an app to explain how it uses health data before it
 * asks for permission. This is that screen: shown from Health Connect's
 * permission dialog ("Privacy policy") and from its settings.
 */
class HealthPrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (20 * resources.displayMetrics.density).toInt()
        val text = TextView(this).apply {
            setPadding(pad, pad * 2, pad, pad * 2)
            textSize = 16f
            setTextColor(0xFFF6EFE9.toInt())
            movementMethod = LinkMovementMethod.getInstance()
            text = """
How Mobu uses your health data

Mobu is a private app for two people. Health data you allow it to read from Health Connect (steps, sleep, heart rate, blood pressure, blood sugar, weight, temperature, oxygen, workouts and, if you turn it on, cycle data) is saved to your Mobu account so you can see charts and keep records.

Who can see it: you. Your partner sees only what you choose to share inside Mobu (Health, then Share). Nothing is shared with advertisers, sold, or used to train AI models.

Readings you type into Mobu (blood pressure, blood sugar, weight, temperature, oxygen, height, body fat) can be written back to Health Connect so other apps see them. You can turn that off in Mobu, in Health settings.

Reports you upload are read by Google's Gemini API to pull out the values, only if you leave "Read reports with AI" on. Turn it off in Health settings and you type the values in yourself.

You can stop sharing at any time in Health Connect, and delete your health data from Mobu in Health settings.
            """.trimIndent()
        }
        setContentView(
            ScrollView(this).apply {
                setBackgroundColor(0xFF110D13.toInt())
                layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                addView(text)
            },
        )
    }
}
