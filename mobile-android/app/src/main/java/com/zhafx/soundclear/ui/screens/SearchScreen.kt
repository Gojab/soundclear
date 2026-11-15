package com.zhafx.soundclear.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zhafx.soundclear.model.SearchFilterType
import com.zhafx.soundclear.model.TrackItem
import com.zhafx.soundclear.ui.components.TrackRowItem
import com.zhafx.soundclear.ui.theme.SoundClearColors

@Composable
fun SearchScreen(
    query: String,
    filter: SearchFilterType,
    results: List<TrackItem>,
    recentSearches: List<String>,
    loading: Boolean,
    currentTrackId: String?,
    onQueryChange: (String) -> Unit,
    onSubmit: (String) -> Unit,
    onFilterChange: (SearchFilterType) -> Unit,
    onPlayTrack: (TrackItem, List<TrackItem>) -> Unit
) {
    val keyboard = LocalSoftwareKeyboardController.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 14.dp)
    ) {
        Text(
            text = "Cari Musik",
            color = SoundClearColors.TextLight,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold
        )
        Spacer(Modifier.height(10.dp))

        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            placeholder = {
                Text("Judul lagu, artis, atau lirik...", color = SoundClearColors.TextMuted)
            },
            leadingIcon = {
                Icon(Icons.Rounded.Search, contentDescription = null, tint = SoundClearColors.MintAccent)
            },
            trailingIcon = {
                if (query.isNotEmpty()) {
                    IconButton(onClick = { onQueryChange("") }) {
                        Icon(Icons.Rounded.Close, contentDescription = "Hapus", tint = SoundClearColors.TextSoft)
                    }
                }
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(
                onSearch = {
                    keyboard?.hide()
                    onSubmit(query)
                }
            ),
            shape = RoundedCornerShape(14.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = SoundClearColors.MintAccent,
                unfocusedBorderColor = SoundClearColors.GlassBorder,
                focusedTextColor = SoundClearColors.TextLight,
                unfocusedTextColor = SoundClearColors.TextLight,
                focusedContainerColor = SoundClearColors.EmeraldPanel,
                unfocusedContainerColor = SoundClearColors.EmeraldPanel
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(10.dp))

        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(SearchFilterType.entries) { f ->
                val selected = f == filter
                Text(
                    text = f.label,
                    color = if (selected) SoundClearColors.EmeraldPanel else SoundClearColors.TextSoft,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(
                            if (selected) SoundClearColors.MintAccent else SoundClearColors.GlassCard
                        )
                        .border(
                            1.dp,
                            if (selected) SoundClearColors.MintAccent else SoundClearColors.GlassBorder,
                            RoundedCornerShape(20.dp)
                        )
                        .clickable { onFilterChange(f) }
                        .padding(horizontal = 14.dp, vertical = 7.dp)
                )
            }
        }

        Spacer(Modifier.height(14.dp))

        if (loading) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 40.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = SoundClearColors.MintAccent)
            }
        } else if (results.isEmpty() && query.isBlank()) {
            if (recentSearches.isNotEmpty()) {
                Text(
                    text = "Pencarian Terakhir",
                    color = SoundClearColors.TextSoft,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(Modifier.height(8.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(recentSearches) { item ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(SoundClearColors.GlassCard)
                                .clickable {
                                    onQueryChange(item)
                                    onSubmit(item)
                                }
                                .padding(horizontal = 12.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(Icons.Rounded.History, contentDescription = null, tint = SoundClearColors.TextMuted)
                            Text(text = item, color = SoundClearColors.TextLight, fontSize = 14.sp)
                        }
                    }
                }
            } else {
                Text(
                    text = "Ketik nama artis atau lagu Indonesia favoritmu lalu tekan Cari.",
                    color = SoundClearColors.TextMuted,
                    fontSize = 13.sp
                )
            }
        } else if (results.isEmpty()) {
            Text(
                text = "Tidak ada hasil ditemukan untuk \"$query\".",
                color = SoundClearColors.TextMuted,
                fontSize = 13.sp
            )
        } else {
            LazyColumn(
                contentPadding = PaddingValues(bottom = 90.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(results, key = { it.id }) { track ->
                    TrackRowItem(
                        track = track,
                        isCurrent = track.id == currentTrackId,
                        onClick = { onPlayTrack(track, results) }
                    )
                }
            }
        }
    }
}
