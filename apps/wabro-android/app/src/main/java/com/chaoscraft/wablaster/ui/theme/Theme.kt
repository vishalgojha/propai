package com.chaoscraft.wablaster.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Brand = Color(0xFF10B981)
val BgDeep = Color(0xFF050505)
val BgSurface = Color(0xFF0A0A0A)
val BgCard = Color(0xFF121212)
val BorderDim = Color(0xFF222222)
val BorderBright = Color(0xFF333333)
val TextMain = Color(0xFFE5E5E5)
val TextMuted = Color(0xFF666666)

private val DarkColorScheme = darkColorScheme(
    primary = Brand,
    secondary = Color(0xFF10B981),
    tertiary = Color(0xFF6DD3A8),
    background = BgDeep,
    surface = BgSurface,
    surfaceVariant = BgCard,
    onPrimary = Color.Black,
    onSecondary = Color.Black,
    onTertiary = Color.Black,
    onBackground = TextMain,
    onSurface = TextMain,
    onSurfaceVariant = TextMuted,
    outline = BorderDim,
    outlineVariant = BorderBright
)

private val LightColorScheme = lightColorScheme(
    primary = Brand,
    secondary = Color(0xFF059669),
    tertiary = Color(0xFF047857),
    background = Color(0xFFF7F9F8),
    surface = Color.White,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onTertiary = Color.White,
    onBackground = Color(0xFF101412),
    onSurface = Color(0xFF101412)
)

@Composable
fun WaBroV2Theme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography(),
        content = content
    )
}

@Composable
fun WaBlasterTheme(content: @Composable () -> Unit) {
    WaBroV2Theme(content = content)
}
