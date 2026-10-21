package com.openplay.app

import android.app.Application
import android.content.ComponentName
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class Vm(app: Application) : AndroidViewModel(app) {
    private val ctx = app.applicationContext
    private val store = Store(ctx)
    private val handler = Handler(Looper.getMainLooper())
    var controller: MediaController? = null

    var tracks by mutableStateOf(listOf<Track>()); private set
    var loaded by mutableStateOf(false); private set
    var hasPermission by mutableStateOf(false)
    var theme by mutableStateOf(store.theme); private set
    var favs by mutableStateOf(store.favs()); private set
    var lists by mutableStateOf(store.lists()); private set
    var recent by mutableStateOf(store.recent()); private set
    var current by mutableStateOf<MediaItem?>(null); private set
    var currentIndex by mutableStateOf(0); private set
    var playing by mutableStateOf(false); private set
    var shuffle by mutableStateOf(false); private set
    var repeat by mutableStateOf(Player.REPEAT_MODE_OFF); private set
    var queue by mutableStateOf(listOf<MediaItem>()); private set
    var timerMin by mutableStateOf(0); private set

    private val timerRun = Runnable {
        controller?.pause()
        timerMin = 0
    }

    init { connect() }

    private fun connect() {
        val token = SessionToken(ctx, ComponentName(ctx, PlaybackService::class.java))
        val f = MediaController.Builder(ctx, token).buildAsync()
        f.addListener({
            try {
                val c = f.get()
                controller = c
                c.addListener(object : Player.Listener {
                    override fun onEvents(player: Player, events: Player.Events) { sync() }
                })
                sync()
            } catch (e: Exception) { }
        }, ContextCompat.getMainExecutor(ctx))
    }

    fun sync() {
        val c = controller ?: return
        current = c.currentMediaItem
        currentIndex = c.currentMediaItemIndex
        playing = c.isPlaying
        shuffle = c.shuffleModeEnabled
        repeat = c.repeatMode
        queue = List(c.mediaItemCount) { c.getMediaItemAt(it) }
        val id = current?.mediaId?.toLongOrNull()
        if (id != null && playing && recent.firstOrNull() != id) {
            recent = (listOf(id) + recent.filter { it != id }).take(20)
            store.saveRecent(recent)
        }
    }

    fun refresh() {
        viewModelScope.launch {
            val l = withContext(Dispatchers.IO) { loadTracks(ctx) }
            tracks = l
            loaded = true
        }
    }

    fun track(id: Long): Track? = tracks.firstOrNull { it.id == id }
    fun position(): Long = controller?.currentPosition ?: 0L
    fun duration(): Long = (controller?.duration ?: 0L).coerceAtLeast(0L)

    fun play(ids: List<Long>, start: Long) {
        val c = controller ?: return
        val valid = ids.mapNotNull { track(it) }
        if (valid.isEmpty()) return
        val i = valid.indexOfFirst { it.id == start }.coerceAtLeast(0)
        c.setMediaItems(valid.map { it.toItem() }, i, 0L)
        c.prepare()
        c.play()
    }

    fun toggle() { controller?.let { if (it.isPlaying) it.pause() else it.play() } }
    fun next() { controller?.seekToNext() }
    fun prev() { controller?.seekToPrevious() }
    fun seek(ms: Long) { controller?.seekTo(ms) }
    fun toggleShuffle() { controller?.shuffleModeEnabled = !shuffle }
    fun cycleRepeat() {
        controller?.repeatMode = when (repeat) {
            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
    }

    fun playNext(t: Track) {
        val c = controller ?: return
        if (c.mediaItemCount == 0) play(listOf(t.id), t.id)
        else c.addMediaItem(c.currentMediaItemIndex + 1, t.toItem())
    }

    fun addToQueue(t: Track) {
        val c = controller ?: return
        if (c.mediaItemCount == 0) play(listOf(t.id), t.id) else c.addMediaItem(t.toItem())
    }

    fun playAt(i: Int) { controller?.let { it.seekToDefaultPosition(i); it.play() } }
    fun removeAt(i: Int) { controller?.removeMediaItem(i) }
    fun moveItem(from: Int, to: Int) {
        val c = controller ?: return
        if (to in 0 until c.mediaItemCount) c.moveMediaItem(from, to)
    }

    fun toggleFav(id: Long) {
        favs = if (id in favs) favs - id else favs + id
        store.saveFavs(favs)
    }

    private fun commitLists(m: Map<String, List<Long>>) { lists = m; store.saveLists(m) }
    fun createList(name: String) { if (name.isNotBlank() && !lists.containsKey(name)) commitLists(lists + (name to emptyList())) }
    fun renameList(old: String, new: String) {
        if (new.isBlank() || lists.containsKey(new)) return
        val m = LinkedHashMap<String, List<Long>>()
        for ((k, v) in lists) m[if (k == old) new else k] = v
        commitLists(m)
    }
    fun deleteList(name: String) { commitLists(lists - name) }
    fun addToList(name: String, id: Long) {
        val l = lists[name] ?: return
        if (id !in l) commitLists(lists + (name to (l + id)))
    }
    fun removeFromList(name: String, id: Long) {
        val l = lists[name] ?: return
        commitLists(lists + (name to l.filter { it != id }))
    }

    fun setTheme(v: String) { theme = v; store.theme = v }

    fun setTimer(min: Int) {
        handler.removeCallbacks(timerRun)
        timerMin = min
        if (min > 0) handler.postDelayed(timerRun, min * 60_000L)
    }

    override fun onCleared() {
        handler.removeCallbacks(timerRun)
        controller?.release()
        super.onCleared()
    }
}
