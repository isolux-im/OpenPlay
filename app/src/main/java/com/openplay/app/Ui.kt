package com.openplay.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.Player
import coil.compose.AsyncImage
import kotlinx.coroutines.delay

// ---------- Thème (palette neutre de la maquette ; valeurs à affiner) ----------
private val LightC = lightColorScheme(
    primary = Color(0xFF191C21), onPrimary = Color.White,
    background = Color(0xFFF2F3F7), onBackground = Color(0xFF1A191F),
    surface = Color.White, onSurface = Color(0xFF1A191F),
    onSurfaceVariant = Color(0xFF8A8D96), surfaceVariant = Color(0xFFE6E8EE)
)
private val DarkC = darkColorScheme(
    primary = Color(0xFFF2F3F7), onPrimary = Color(0xFF17181F),
    background = Color(0xFF17181F), onBackground = Color(0xFFF2F3F7),
    surface = Color(0xFF22232D), onSurface = Color(0xFFF2F3F7),
    onSurfaceVariant = Color(0xFF9A9CA8), surfaceVariant = Color(0xFF2C2D38)
)

@Composable
fun OpenPlayTheme(mode: String, content: @Composable () -> Unit) {
    val dark = when (mode) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
    MaterialTheme(colorScheme = if (dark) DarkC else LightC, content = content)
}

enum class Screen(val label: String, val icon: ImageVector) {
    Home("Accueil", Icons.Outlined.Home),
    Library("Bibliothèque", Icons.Outlined.LibraryMusic),
    Playlists("Playlists", Icons.Outlined.QueueMusic),
    Settings("Réglages", Icons.Outlined.Settings)
}

@Composable
fun App(vm: Vm, askPermission: () -> Unit) {
    var screen by remember { mutableStateOf(Screen.Home) }
    var showPlayer by remember { mutableStateOf(false) }
    var addTo by remember { mutableStateOf<Track?>(null) }
    BackHandler(enabled = showPlayer) { showPlayer = false }
    LaunchedEffect(vm.current == null) { if (vm.current == null) showPlayer = false }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Header(screen, vm)
            Box(Modifier.weight(1f)) {
                when (screen) {
                    Screen.Home -> HomeScreen(vm, askPermission, { addTo = it }, { screen = Screen.Library })
                    Screen.Library -> LibraryScreen(vm, askPermission) { addTo = it }
                    Screen.Playlists -> PlaylistsScreen(vm) { addTo = it }
                    Screen.Settings -> SettingsScreen(vm)
                }
            }
        }
        Column(Modifier.align(Alignment.BottomCenter)) {
            if (vm.current != null) MiniPlayer(vm) { showPlayer = true }
            NavBar(screen) { screen = it }
        }
        if (showPlayer && vm.current != null) PlayerScreen(vm) { showPlayer = false }
        addTo?.let { t -> AddToListDialog(vm, t) { addTo = null } }
    }
}

@Composable
fun Header(screen: Screen, vm: Vm) {
    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 12.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(screen.label, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Text("Écouter, autrement.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        // Icône de thème : soleil / lune / automatique ; cycle clair → sombre → système
        val icon = when (vm.theme) { "light" -> Icons.Outlined.LightMode; "dark" -> Icons.Outlined.DarkMode; else -> Icons.Outlined.BrightnessAuto }
        val next = when (vm.theme) { "light" -> "dark"; "dark" -> "system"; else -> "light" }
        IconButton(onClick = { vm.setTheme(next) }) { Icon(icon, contentDescription = "Changer de thème") }
    }
}

@Composable
fun Art(model: Any?, size: androidx.compose.ui.unit.Dp, radius: androidx.compose.ui.unit.Dp = 12.dp) {
    Box(
        Modifier.size(size).clip(RoundedCornerShape(radius)).background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center
    ) {
        Icon(Icons.Outlined.MusicNote, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(size / 2))
        AsyncImage(model = model, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
    }
}

@Composable
fun Empty(msg: String, label: String? = null, onClick: () -> Unit = {}) {
    Column(Modifier.fillMaxSize().padding(32.dp), Arrangement.Center, Alignment.CenterHorizontally) {
        Text(msg, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (label != null) {
            Spacer(Modifier.height(16.dp))
            Button(onClick = onClick) { Text(label) }
        }
    }
}

@Composable
fun Gate(vm: Vm, ask: () -> Unit, content: @Composable () -> Unit) {
    when {
        !vm.hasPermission -> Empty("Autorisez l’accès à votre musique pour afficher votre bibliothèque.", "Autoriser", ask)
        !vm.loaded -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        vm.tracks.isEmpty() -> Empty("Aucun morceau trouvé sur cet appareil.", "Actualiser") { vm.refresh() }
        else -> content()
    }
}

@Composable
fun Section(title: String) {
    Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 18.dp, bottom = 4.dp))
}

@Composable
fun TrackRow(t: Track, vm: Vm, onPlay: () -> Unit, onAdd: (Track) -> Unit, onRemove: (() -> Unit)? = null) {
    var menu by remember { mutableStateOf(false) }
    val fav = t.id in vm.favs
    Row(Modifier.fillMaxWidth().clickable { onPlay() }.padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Art(t.art, 48.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(t.title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Text("${t.artist} · ${fmt(t.durationMs)}", maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Box {
            IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "Options") }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("Lire ensuite") }, onClick = { menu = false; vm.playNext(t) })
                DropdownMenuItem(text = { Text("Ajouter à la file") }, onClick = { menu = false; vm.addToQueue(t) })
                DropdownMenuItem(text = { Text(if (fav) "Retirer des favoris" else "Ajouter aux favoris") }, onClick = { menu = false; vm.toggleFav(t.id) })
                DropdownMenuItem(text = { Text("Ajouter à une playlist") }, onClick = { menu = false; onAdd(t) })
                if (onRemove != null) DropdownMenuItem(text = { Text("Retirer de la playlist") }, onClick = { menu = false; onRemove() })
            }
        }
    }
}

@Composable
fun TrackList(list: List<Track>, vm: Vm, onAdd: (Track) -> Unit, modifier: Modifier = Modifier) {
    LazyColumn(modifier, contentPadding = PaddingValues(bottom = 190.dp)) {
        items(list, key = { it.id }) { t ->
            TrackRow(t, vm, { vm.play(list.map { x -> x.id }, t.id) }, onAdd)
        }
    }
}

@Composable
fun HomeScreen(vm: Vm, ask: () -> Unit, onAdd: (Track) -> Unit, openLibrary: () -> Unit) {
    Gate(vm, ask) {
        val recent = vm.recent.mapNotNull { vm.track(it) }.take(5)
        val favs = vm.tracks.filter { it.id in vm.favs }
        LazyColumn(contentPadding = PaddingValues(bottom = 190.dp)) {
            vm.current?.let { cur ->
                item {
                    Section("En cours")
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Art(cur.mediaMetadata.artworkUri, 48.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(cur.mediaMetadata.title?.toString() ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Text(cur.mediaMetadata.artist?.toString() ?: "", maxLines = 1, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        IconButton(onClick = { vm.toggle() }) { Icon(if (vm.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, null) }
                    }
                }
            }
            if (recent.isNotEmpty()) {
                item { Section("Écoutés récemment") }
                items(recent, key = { "r${it.id}" }) { t -> TrackRow(t, vm, { vm.play(recent.map { x -> x.id }, t.id) }, onAdd) }
            }
            if (favs.isNotEmpty()) {
                item { Section("Favoris") }
                items(favs, key = { "f${it.id}" }) { t -> TrackRow(t, vm, { vm.play(favs.map { x -> x.id }, t.id) }, onAdd) }
            }
            item {
                Section("Bibliothèque")
                OutlinedButton(onClick = openLibrary, modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
                    Text("${vm.tracks.size} morceaux · Ouvrir")
                }
            }
        }
    }
}

@Composable
fun LibraryScreen(vm: Vm, ask: () -> Unit, onAdd: (Track) -> Unit) {
    Gate(vm, ask) {
        var q by remember { mutableStateOf("") }
        var sort by remember { mutableStateOf("title") }
        val list = remember(vm.tracks, q, sort) {
            val f = vm.tracks.filter { q.isBlank() || (it.title + " " + it.artist + " " + it.album).contains(q, ignoreCase = true) }
            when (sort) {
                "artist" -> f.sortedBy { it.artist.lowercase() }
                "dur" -> f.sortedBy { it.durationMs }
                "added" -> f.sortedByDescending { it.added }
                else -> f.sortedBy { it.title.lowercase() }
            }
        }
        Column {
            OutlinedTextField(
                value = q, onValueChange = { q = it }, singleLine = true,
                placeholder = { Text("Rechercher") }, shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            )
            Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("title" to "Titre", "artist" to "Artiste", "dur" to "Durée", "added" to "Ajout").forEach { (k, l) ->
                    FilterChip(selected = sort == k, onClick = { sort = k }, label = { Text(l, fontSize = 12.sp) })
                }
            }
            if (list.isEmpty()) Empty("Aucun résultat.") else TrackList(list, vm, onAdd, Modifier.weight(1f))
        }
    }
}

@Composable
fun NameDialog(title: String, initial: String, onDismiss: () -> Unit, onOk: (String) -> Unit) {
    var v by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { OutlinedTextField(value = v, onValueChange = { v = it }, singleLine = true) },
        confirmButton = { TextButton(onClick = { if (v.isNotBlank()) onOk(v.trim()) }) { Text("OK") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } }
    )
}

@Composable
fun AddToListDialog(vm: Vm, t: Track, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Ajouter à une playlist") },
        text = {
            if (vm.lists.isEmpty()) Text("Créez d’abord une playlist dans l’onglet Playlists.")
            else Column {
                vm.lists.keys.forEach { n ->
                    TextButton(onClick = { vm.addToList(n, t.id); onDismiss() }) { Text(n) }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Fermer") } }
    )
}

@Composable
fun PlaylistsScreen(vm: Vm, onAdd: (Track) -> Unit) {
    var open by remember { mutableStateOf<String?>(null) }
    var creating by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val name = open
    if (name != null && vm.lists.containsKey(name)) {
        val ts = vm.lists[name].orEmpty().mapNotNull { vm.track(it) }
        Column {
            Row(Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { open = null }) { Icon(Icons.Outlined.ArrowBack, "Retour") }
                Text(name, fontWeight = FontWeight.Bold, fontSize = 18.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                IconButton(onClick = { renaming = true }) { Icon(Icons.Outlined.Edit, "Renommer") }
                IconButton(onClick = { deleting = true }) { Icon(Icons.Outlined.Delete, "Supprimer") }
            }
            Button(
                onClick = { if (ts.isNotEmpty()) vm.play(ts.map { it.id }, ts.first().id) },
                modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth()
            ) { Icon(Icons.Filled.PlayArrow, null); Text("Lire la playlist") }
            if (ts.isEmpty()) Empty("Playlist vide. Ajoutez des morceaux depuis le menu ⋮ d’un titre.")
            else LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(bottom = 190.dp)) {
                items(ts, key = { it.id }) { t ->
                    TrackRow(t, vm, { vm.play(ts.map { x -> x.id }, t.id) }, onAdd, onRemove = { vm.removeFromList(name, t.id) })
                }
            }
        }
        if (renaming) NameDialog("Renommer la playlist", name, { renaming = false }) { vm.renameList(name, it); open = it; renaming = false }
        if (deleting) AlertDialog(
            onDismissRequest = { deleting = false },
            title = { Text("Supprimer « $name » ?") },
            confirmButton = { TextButton(onClick = { vm.deleteList(name); open = null; deleting = false }) { Text("Supprimer") } },
            dismissButton = { TextButton(onClick = { deleting = false }) { Text("Annuler") } }
        )
    } else {
        Column {
            Button(onClick = { creating = true }, modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth()) {
                Icon(Icons.Filled.Add, null); Text("Nouvelle playlist")
            }
            if (vm.lists.isEmpty()) Empty("Aucune playlist pour le moment.")
            else LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(bottom = 190.dp)) {
                items(vm.lists.keys.toList()) { n ->
                    Row(Modifier.fillMaxWidth().clickable { open = n }.padding(horizontal = 16.dp, vertical = 14.dp)) {
                        Text(n, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Text("${vm.lists[n].orEmpty().size} morceaux", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    }
                }
            }
        }
    }
    if (creating) NameDialog("Nouvelle playlist", "", { creating = false }) { vm.createList(it); creating = false }
}

@Composable
fun SettingsScreen(vm: Vm) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 190.dp)) {
        Text("Thème", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp, bottom = 6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("light" to "Clair", "dark" to "Sombre", "system" to "Système").forEach { (k, l) ->
                FilterChip(selected = vm.theme == k, onClick = { vm.setTheme(k) }, label = { Text(l) })
            }
        }
        Text("Minuterie d’arrêt", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 20.dp, bottom = 6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(0 to "Désactivée", 15 to "15 min", 30 to "30 min", 60 to "60 min").forEach { (m, l) ->
                FilterChip(selected = vm.timerMin == m, onClick = { vm.setTimer(m) }, label = { Text(l, fontSize = 12.sp) })
            }
        }
        Text("Bibliothèque", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 20.dp, bottom = 6.dp))
        OutlinedButton(onClick = { vm.refresh() }) { Text("Actualiser la bibliothèque") }
        Text(
            "OpenPlay 1.0 · sans publicité. Vos fichiers restent sur l’appareil : aucune donnée n’est envoyée.",
            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 24.dp)
        )
    }
}

@Composable
fun MiniPlayer(vm: Vm, onOpen: () -> Unit) {
    val m = vm.current?.mediaMetadata
    Surface(
        color = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary,
        shape = RoundedCornerShape(22.dp),
        modifier = Modifier.padding(horizontal = 12.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).clickable { onOpen() }
    ) {
        Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Art(m?.artworkUri, 40.dp, 10.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(m?.title?.toString() ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                Text(m?.artist?.toString() ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 12.sp, modifier = Modifier.background(Color.Transparent))
            }
            IconButton(onClick = { vm.toggle() }) { Icon(if (vm.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, "Lecture/pause") }
            IconButton(onClick = { vm.next() }) { Icon(Icons.Filled.SkipNext, "Suivant") }
        }
    }
}

// Barre d'onglets « verre » : surface translucide + fine bordure (approximation du Liquid Glass)
@Composable
fun NavBar(current: Screen, onSelect: (Screen) -> Unit) {
    Surface(
        modifier = Modifier.navigationBarsPadding().padding(horizontal = 12.dp, vertical = 10.dp).fillMaxWidth(),
        shape = RoundedCornerShape(26.dp),
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.86f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)),
        shadowElevation = 6.dp
    ) {
        Row(Modifier.padding(8.dp)) {
            Screen.values().forEach { s ->
                val sel = s == current
                val tint = if (sel) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).clickable { onSelect(s) }.padding(vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(s.icon, null, tint = tint)
                    Text(s.label, fontSize = 10.sp, color = tint, fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1)
                }
            }
        }
    }
}

@Composable
fun PlayerScreen(vm: Vm, onClose: () -> Unit) {
    var showQueue by remember { mutableStateOf(false) }
    var pos by remember { mutableLongStateOf(0L) }
    var dur by remember { mutableLongStateOf(0L) }
    var dragging by remember { mutableStateOf(false) }
    var drag by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        while (true) {
            if (!dragging) { pos = vm.position(); dur = vm.duration() }
            delay(400)
        }
    }
    val m = vm.current?.mediaMetadata
    val id = vm.current?.mediaId?.toLongOrNull()
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val on = MaterialTheme.colorScheme.primary

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 24.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onClose) { Icon(Icons.Filled.KeyboardArrowDown, "Fermer") }
                Text("Lecture en cours", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                IconButton(onClick = { showQueue = !showQueue }) { Icon(Icons.Outlined.QueueMusic, "File d’attente", tint = if (showQueue) on else muted) }
            }
            if (showQueue) {
                Text("File d’attente", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(vertical = 8.dp))
                LazyColumn(Modifier.weight(1f)) {
                    itemsIndexed(vm.queue) { i, item ->
                        Row(Modifier.fillMaxWidth().clickable { vm.playAt(i) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(item.mediaMetadata.title?.toString() ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    fontWeight = if (i == vm.currentIndex) FontWeight.Bold else FontWeight.Normal)
                                Text(item.mediaMetadata.artist?.toString() ?: "", maxLines = 1, fontSize = 12.sp, color = muted)
                            }
                            IconButton(onClick = { vm.moveItem(i, i - 1) }) { Icon(Icons.Filled.KeyboardArrowUp, "Monter") }
                            IconButton(onClick = { vm.moveItem(i, i + 1) }) { Icon(Icons.Filled.KeyboardArrowDown, "Descendre") }
                            IconButton(onClick = { vm.removeAt(i) }) { Icon(Icons.Filled.Close, "Retirer") }
                        }
                    }
                }
            } else {
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
                    Spacer(Modifier.height(12.dp))
                    Box(Modifier.fillMaxWidth(0.85f)) { Art(m?.artworkUri, 320.dp, 28.dp) }
                    Spacer(Modifier.height(20.dp))
                    Text(m?.title?.toString() ?: "", fontSize = 24.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2)
                    Text(m?.artist?.toString() ?: "", color = muted, modifier = Modifier.padding(top = 4.dp))
                }
            }
            Slider(
                value = if (dragging) drag else pos.toFloat().coerceAtMost(maxOf(dur, 1L).toFloat()),
                onValueChange = { dragging = true; drag = it },
                onValueChangeFinished = { vm.seek(drag.toLong()); pos = drag.toLong(); dragging = false },
                valueRange = 0f..maxOf(dur, 1L).toFloat()
            )
            Row(Modifier.fillMaxWidth()) {
                Text(fmt(if (dragging) drag.toLong() else pos), fontSize = 11.sp, color = muted, modifier = Modifier.weight(1f))
                Text(fmt(dur), fontSize = 11.sp, color = muted)
            }
            Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { vm.toggleShuffle() }) { Icon(Icons.Filled.Shuffle, "Aléatoire", tint = if (vm.shuffle) on else muted) }
                IconButton(onClick = { vm.prev() }) { Icon(Icons.Filled.SkipPrevious, "Précédent", modifier = Modifier.size(32.dp)) }
                FilledIconButton(onClick = { vm.toggle() }, modifier = Modifier.size(68.dp)) {
                    Icon(if (vm.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, "Lecture/pause", modifier = Modifier.size(32.dp))
                }
                IconButton(onClick = { vm.next() }) { Icon(Icons.Filled.SkipNext, "Suivant", modifier = Modifier.size(32.dp)) }
                IconButton(onClick = { vm.cycleRepeat() }) {
                    Icon(
                        if (vm.repeat == Player.REPEAT_MODE_ONE) Icons.Filled.RepeatOne else Icons.Filled.Repeat, "Répétition",
                        tint = if (vm.repeat == Player.REPEAT_MODE_OFF) muted else on
                    )
                }
            }
            if (id != null) {
                IconButton(onClick = { vm.toggleFav(id) }, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                    Icon(if (id in vm.favs) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, "Favori", tint = if (id in vm.favs) on else muted)
                }
            }
        }
    }
}
