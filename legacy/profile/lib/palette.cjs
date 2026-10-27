"use strict";
// The four themes. The "dark" palette reuses the colors of the existing statistics cards.

const THEMES = {
  dark: {
    bg: "#0D1117", bg2: "#0F1A2B", panel: "#161B22", border: "#30363D", fg: "#C9D1D9", muted: "#8B949E",
    accent: "#58A6FF", accent2: "#3FB950", hot: "#0f2a4a", glow: 0.26, dots: "#30363D", gold: "#F2C200", flame: "#FF9A3C",
  },
  light: {
    bg: "#FFFFFF", bg2: "#EAF3FF", panel: "#F6F8FA", border: "#D0D7DE", fg: "#1F2328", muted: "#656D76",
    accent: "#0969DA", accent2: "#1A7F37", hot: "#DDF4FF", glow: 0.16, dots: "#D0D7DE", gold: "#B38600", flame: "#E8590C",
  },
  "funky-dark": {
    bg: "#140B2E", bg2: "#2A0F4D", panel: "#1E1245", border: "#4B2FA0", fg: "#F3EAFF", muted: "#B9A6E8",
    accent: "#FF4FD8", accent2: "#3DF5FF", hot: "#3a1560", glow: 0.4, dots: "#3A2680", gold: "#FFD166", flame: "#FF9A3C",
  },
  "funky-light": {
    bg: "#D2C6FF", bg2: "#FFC2E8", panel: "#DDD3FF", border: "#7B3FE4", fg: "#24105A", muted: "#5B3FB0",
    accent: "#D1128F", accent2: "#00B2C2", hot: "#FFC8EC", glow: 0.55, dots: "#B7A5F5", gold: "#8A5A00", flame: "#E8590C",
  },
};

const THEME_NAMES = Object.keys(THEMES);

module.exports = { THEMES, THEME_NAMES };
