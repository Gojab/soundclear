package com.zhafx.soundclear.ui.screens

import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zhafx.soundclear.R
import com.zhafx.soundclear.model.HomeSection
import com.zhafx.soundclear.model.TrackItem
import com.zhafx.soundclear.ui.components.ArtworkBox
import com.zhafx.soundclear.ui.components.TrackRowItem
import com.zhafx.soundclear.ui.theme.SoundClearColors

@Composable
fun HomeScreen(
    sections: List<HomeSection>,
    loading: Boolean,
    error: String?,
    currentTrackId: String?,
    onRefresh: () -> Unit,
    onPlayTrack: (TrackItem, List<TrackItem>) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Image(
                        painter = painterResource(id = R.drawable.soundclear_logo),
                        contentDescription = "SoundClear",
                        modifier = Modifier
                            .size(34.dp)
                            .clip(RoundedCornerShape(10.dp))
                    )
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text(
                            text = "SoundClear",
                            color = SoundClearColors.TextLight,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Mandiri · Indonesia Charts & Hi-Res DSP",
                            color = SoundClearColors.MintAccent,
                            fontSize = 11.sp
                        )
                    }
                }
                IconButton(onClick = onRefresh) {
                    Icon(
                        imageVector = Icons.Rounded.Refresh,
                        contentDescription = "Muat ulang",
                        tint = SoundClearColors.TextSoft
                    )
                }
            }
        }

        if (loading && sections.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 48.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = SoundClearColors.MintAccent)
                }
            }
        } else if (error != null && sections.isEmpty()) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(SoundClearColors.GlassCard)
                        .border(1.dp, SoundClearColors.GlassBorder, RoundedCornerShape(16.dp))
                        .padding(18.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(text = error, color = SoundClearColors.TextSoft, fontSize = 13.sp)
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = onRefresh,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = SoundClearColors.EmeraldAccent,
                            contentColor = SoundClearColors.EmeraldPanel
                        )
                    ) {
                        Text("Coba Lagi", fontWeight = FontWeight.Bold)
                    }
                }
            }
        } else {
            sections.forEachIndexed { index, section ->
                item(key = section.title) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            text = section.title,
                            color = SoundClearColors.TextLight,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold
                        )
                        if (index == 0) {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                items(section.items, key = { it.id }) { track ->
                                    Column(
                                        modifier = Modifier
                                            .width(142.dp)
                                            .clip(RoundedCornerShape(14.dp))
                                            .background(SoundClearColors.GlassCard)
                                            .border(1.dp, SoundClearColors.GlassBorder, RoundedCornerShape(14.dp))
                                            .clickable { onPlayTrack(track, section.items) }
                                            .padding(10.dp)
                                    ) {
                                        ArtworkBox(
                                            url = track.thumbnailUrl,
                                            modifier = Modifier
                                                .size(122.dp)
                                                .clip(RoundedCornerShape(10.dp))
                                        )
                                        Spacer(Modifier.height(8.dp))
                                        Text(
                                            text = track.title,
                                            color = if (track.id == currentTrackId) SoundClearColors.MintAccent else SoundClearColors.TextLight,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            text = track.artist,
                                            color = SoundClearColors.TextMuted,
                                            fontSize = 11.sp,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        } else {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                section.items.take(8).forEach { track ->
                                    TrackRowItem(
                                        track = track,
                                        isCurrent = track.id == currentTrackId,
                                        onClick = { onPlayTrack(track, section.items) }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(90.dp)) }
    }
}
