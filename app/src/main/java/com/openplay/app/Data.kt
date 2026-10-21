package com.openplay.app

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.MediaStore.Audio.Media as AM
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import org.json.JSONArray
import org.json.JSONObject

data class Track(
    val id: Long,
    val title: String,
    val artist: String,
    val album: String,
    val durationMs: Long,
    val albumId: Long,
    val added: Long
) {
    val uri: Uri get() = ContentUris.withAppendedId(AM.EXTERNAL_CONTENT_URI, id)
    val art: Uri get() = ContentUris.withAppendedId(Uri.parse("content://media/external/audio/albumart"), albumId)
}

fun Track.toItem(): MediaItem = MediaItem.Builder()
    .setMediaId(id.toString())
    .setUri(uri)
    .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(uri).build())
    .setMediaMetadata(
        MediaMetadata.Builder()
            .setTitle(title).setArtist(artist).setAlbumTitle(album).setArtworkUri(art).build()
    )
    .build()

fun fmt(ms: Long): String {
    val s = if (ms > 0) ms / 1000 else 0
    return "%d:%02d".format(s / 60, s % 60)
}

fun loadTracks(ctx: Context): List<Track> {
    val out = ArrayList<Track>()
    val col = if (Build.VERSION.SDK_INT >= 29) AM.getContentUri(MediaStore.VOLUME_EXTERNAL) else AM.EXTERNAL_CONTENT_URI
    val proj = arrayOf(AM._ID, AM.TITLE, AM.ARTIST, AM.ALBUM, AM.DURATION, AM.ALBUM_ID, AM.DATE_ADDED)
    try {
        ctx.contentResolver.query(col, proj, "${AM.IS_MUSIC} != 0", null, "${AM.TITLE} COLLATE NOCASE ASC")?.use { c ->
            val iId = c.getColumnIndexOrThrow(AM._ID)
            val iT = c.getColumnIndexOrThrow(AM.TITLE)
            val iAr = c.getColumnIndexOrThrow(AM.ARTIST)
            val iAl = c.getColumnIndexOrThrow(AM.ALBUM)
            val iD = c.getColumnIndexOrThrow(AM.DURATION)
            val iAid = c.getColumnIndexOrThrow(AM.ALBUM_ID)
            val iDa = c.getColumnIndexOrThrow(AM.DATE_ADDED)
            while (c.moveToNext()) {
                val artist = c.getString(iAr)
                val album = c.getString(iAl)
                out.add(
                    Track(
                        id = c.getLong(iId),
                        title = c.getString(iT) ?: "Titre inconnu",
                        artist = if (artist.isNullOrBlank() || artist == "<unknown>") "Artiste inconnu" else artist,
                        album = album ?: "",
                        durationMs = c.getLong(iD),
                        albumId = c.getLong(iAid),
                        added = c.getLong(iDa)
                    )
                )
            }
        }
    } catch (e: Exception) {
        // permission refusée ou erreur de lecture : bibliothèque vide
    }
    return out
}

class Store(ctx: Context) {
    private val p = ctx.getSharedPreferences("openplay", Context.MODE_PRIVATE)
    var theme: String
        get() = p.getString("theme", "system") ?: "system"
        set(v) { p.edit().putString("theme", v).apply() }

    fun favs(): Set<Long> = (p.getStringSet("favs", emptySet()) ?: emptySet()).mapNotNull { it.toLongOrNull() }.toSet()
    fun saveFavs(s: Set<Long>) { p.edit().putStringSet("favs", s.map { it.toString() }.toSet()).apply() }

    fun recent(): List<Long> = (p.getString("recent", "") ?: "").split(",").mapNotNull { it.toLongOrNull() }
    fun saveRecent(l: List<Long>) { p.edit().putString("recent", l.joinToString(",")).apply() }

    fun lists(): Map<String, List<Long>> {
        val m = LinkedHashMap<String, List<Long>>()
        try {
            val o = JSONObject(p.getString("lists", "{}") ?: "{}")
            val keys = o.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                val a = o.getJSONArray(k)
                m[k] = (0 until a.length()).map { a.getLong(it) }
            }
        } catch (e: Exception) { }
        return m
    }

    fun saveLists(m: Map<String, List<Long>>) {
        val o = JSONObject()
        for ((k, v) in m) {
            val a = JSONArray()
            v.forEach { a.put(it) }
            o.put(k, a)
        }
        p.edit().putString("lists", o.toString()).apply()
    }
}
