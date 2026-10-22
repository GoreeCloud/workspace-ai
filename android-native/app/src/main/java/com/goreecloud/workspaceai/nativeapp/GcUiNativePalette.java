package com.goreecloud.workspaceai.nativeapp;

import android.content.res.Configuration;

/**
 * Development Android adapter for the GC UI v1 semantic color roles.
 * Source: GoreeCloud/gc-ui/tokens/gc.v1.tokens.json at
 * b83213cf26627b60f26cd1416405152bbb1d4fcb.
 *
 * This maps only the roles used by this offline preview; it does NOT imply
 * complete GC UI conformance or native adapter release qualification.
 */
final class GcUiNativePalette {
    final boolean dark;
    final int canvas, surface, ink, soft, brand, pale, border, muted;
    final int heroStart, heroEnd, heroText, settingsTile, disabledSend;

    private GcUiNativePalette(boolean dark, int canvas, int surface,
            int ink, int soft, int brand, int pale, int border, int muted,
            int heroStart, int heroEnd, int heroText, int settingsTile,
            int disabledSend) {
        this.dark = dark;
        this.canvas = canvas;
        this.surface = surface;
        this.ink = ink;
        this.soft = soft;
        this.brand = brand;
        this.pale = pale;
        this.border = border;
        this.muted = muted;
        this.heroStart = heroStart;
        this.heroEnd = heroEnd;
        this.heroText = heroText;
        this.settingsTile = settingsTile;
        this.disabledSend = disabledSend;
    }

    static GcUiNativePalette forConfiguration(Configuration config) {
        boolean isDark = (config.uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        if (isDark) {
            // canvas, surfaceRaised, onSurface, onSurfaceMuted, primary,
            // selection, divider. Other values are preview-only usages.
            return new GcUiNativePalette(true, 0xFF10131E, 0xFF252B3D,
                    0xFFF2F2FA, 0xFFB3B9CF, 0xFFC5BFFF, 0xFF39316B,
                    0xFF373C50, 0xFFB3B9CF, 0xFF292F40, 0xFF39316B,
                    0xFFF2F2FA, 0xFF292F40, 0xFF39316B);
        }
        return new GcUiNativePalette(false, 0xFFECF0F8, 0xFFFFFFFF,
                0xFF20243A, 0xFF5F657B, 0xFF5145D9, 0xFFE8E6FF,
                0xFFE5E7F0, 0xFF5F657B, 0xFF5145D9, 0xFF7663ED,
                0xFFFFFFFF, 0xFFF2F4FA, 0xFFEBECF5);
    }
}
