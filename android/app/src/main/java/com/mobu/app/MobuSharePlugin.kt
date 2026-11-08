package com.mobu.app

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.content.IntentCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

/**
 * Receives files shared into Mobu from other apps (a lab's PDF from WhatsApp or
 * Gmail, a photo from the gallery, a FHIR .json). Each one is copied into
 * cache/shared and handed to the web app, which uploads it to Health -> Records.
 */
@CapacitorPlugin(name = "MobuShare")
class MobuSharePlugin : Plugin() {
    private val pending = mutableListOf<JSObject>()

    override fun load() {
        activity?.intent?.let { collect(it) }
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        if (collect(intent)) notifyListeners("shared", JSObject().put("count", pending.size), true)
    }

    private fun collect(intent: Intent): Boolean {
        if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return false
        val uris: List<Uri> = if (intent.action == Intent.ACTION_SEND) {
            listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
        } else {
            IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java) ?: emptyList()
        }
        val dir = File(context.cacheDir, "shared").apply { mkdirs() }
        var added = false
        for (uri in uris.take(20)) {
            try {
                val mime = context.contentResolver.getType(uri) ?: intent.type ?: "application/octet-stream"
                var name = "shared-${System.currentTimeMillis()}"
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                    if (c.moveToFirst()) c.getString(0)?.let { name = it }
                }
                val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
                val out = File(dir, "${System.currentTimeMillis()}-$safe")
                context.contentResolver.openInputStream(uri)?.use { input -> out.outputStream().use { input.copyTo(it) } } ?: continue
                if (out.length() > 25L * 1024 * 1024) { out.delete(); continue }
                pending += JSObject().put("path", "shared/${out.name}").put("name", name).put("mime", mime)
                added = true
            } catch (e: Exception) {
                // One unreadable file shouldn't drop the rest.
            }
        }
        // Don't re-import the same share if the activity is recreated.
        intent.action = Intent.ACTION_MAIN
        return added
    }

    @PluginMethod
    fun take(call: PluginCall) {
        val files = JSArray()
        pending.forEach { files.put(it) }
        pending.clear()
        call.resolve(JSObject().put("files", files))
    }
}
