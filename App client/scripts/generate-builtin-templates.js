const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
sharp.cache(false);

const TEMPLATES_DIR = path.join(__dirname, '..', 'assets', 'templates');

function ensureTemplatesDir() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }
}

// 1. Korean Life4Cuts (2:3, 1200 x 1800)
function getKorean4CutSvg() {
  return `
  <svg width="1200" height="1800" viewBox="0 0 1200 1800" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Soft drop shadow -->
      <filter id="soft-shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.12"/>
      </filter>
      <!-- Gradient for badge -->
      <linearGradient id="korean-accent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fdf2f8"/>
        <stop offset="100%" stop-color="#fce7f3"/>
      </linearGradient>
    </defs>

    <!-- Outer photostrip border (solid border leaving transparent camera viewport) -->
    <!-- Top Bar -->
    <rect x="0" y="0" width="1200" height="90" fill="#ffffff" opacity="0.97"/>
    <!-- Bottom Bar -->
    <rect x="0" y="1590" width="1200" height="210" fill="#ffffff" opacity="0.98"/>
    <!-- Left Border -->
    <rect x="0" y="90" width="45" height="1500" fill="#ffffff" opacity="0.97"/>
    <!-- Right Border -->
    <rect x="1155" y="90" width="45" height="1500" fill="#ffffff" opacity="0.97"/>

    <!-- Subtle framing lines around the viewport -->
    <rect x="45" y="90" width="1110" height="1500" fill="none" stroke="#e2e8f0" stroke-width="2"/>
    <rect x="52" y="97" width="1096" height="1486" fill="none" stroke="#f1f5f9" stroke-width="1.5" stroke-dasharray="8 6"/>

    <!-- Top Header Elements -->
    <g transform="translate(60, 48)">
      <!-- Mini Camera Icon -->
      <rect x="0" y="0" width="28" height="20" rx="4" fill="#0f172a"/>
      <circle cx="14" cy="10" r="5" fill="#ffffff"/>
      <circle cx="14" cy="10" r="3" fill="#0f172a"/>
      <rect x="5" y="-3" width="7" height="3" rx="1.5" fill="#0f172a"/>
      <text x="40" y="16" fill="#0f172a" font-family="'Inter', 'Outfit', sans-serif" font-weight="700" font-size="20" letter-spacing="3">LIFE FOUR CUTS</text>
    </g>

    <!-- Top Right: Korean Characters & Hearts -->
    <g transform="translate(1000, 48)">
      <text x="0" y="15" fill="#e11d48" font-family="sans-serif" font-weight="bold" font-size="18">♥ 인생네컷</text>
      <text x="100" y="14" fill="#94a3b8" font-family="'JetBrains Mono', monospace" font-size="13">#01</text>
    </g>

    <!-- Side Perforation/Notches (Film strip aesthetic) -->
    <g fill="#e2e8f0">
      <circle cx="22" cy="200" r="8"/>
      <circle cx="22" cy="500" r="8"/>
      <circle cx="22" cy="800" r="8"/>
      <circle cx="22" cy="1100" r="8"/>
      <circle cx="22" cy="1400" r="8"/>

      <circle cx="1178" cy="200" r="8"/>
      <circle cx="1178" cy="500" r="8"/>
      <circle cx="1178" cy="800" r="8"/>
      <circle cx="1178" cy="1100" r="8"/>
      <circle cx="1178" cy="1400" r="8"/>
    </g>

    <!-- Bottom Footer Elements -->
    <!-- Barcode -->
    <g transform="translate(80, 1630)">
      <rect x="0" y="0" width="4" height="60" fill="#0f172a"/>
      <rect x="7" y="0" width="2" height="60" fill="#0f172a"/>
      <rect x="12" y="0" width="6" height="60" fill="#0f172a"/>
      <rect x="22" y="0" width="3" height="60" fill="#0f172a"/>
      <rect x="28" y="0" width="1" height="60" fill="#0f172a"/>
      <rect x="33" y="0" width="5" height="60" fill="#0f172a"/>
      <rect x="42" y="0" width="2" height="60" fill="#0f172a"/>
      <rect x="47" y="0" width="7" height="60" fill="#0f172a"/>
      <rect x="58" y="0" width="3" height="60" fill="#0f172a"/>
      <rect x="65" y="0" width="5" height="60" fill="#0f172a"/>
      <rect x="74" y="0" width="2" height="60" fill="#0f172a"/>
      <rect x="80" y="0" width="4" height="60" fill="#0f172a"/>
      <rect x="88" y="0" width="6" height="60" fill="#0f172a"/>
      <rect x="98" y="0" width="2" height="60" fill="#0f172a"/>
      <rect x="104" y="0" width="4" height="60" fill="#0f172a"/>
      <rect x="112" y="0" width="7" height="60" fill="#0f172a"/>
      <rect x="123" y="0" width="2" height="60" fill="#0f172a"/>
      <rect x="129" y="0" width="5" height="60" fill="#0f172a"/>
      <rect x="138" y="0" width="3" height="60" fill="#0f172a"/>
      <rect x="145" y="0" width="6" height="60" fill="#0f172a"/>
      <rect x="155" y="0" width="2" height="60" fill="#0f172a"/>
      <text x="0" y="78" fill="#64748b" font-family="'JetBrains Mono', monospace" font-size="12" letter-spacing="3">8 935001 729104</text>
    </g>

    <!-- Center Typography -->
    <g transform="translate(600, 1660)" text-anchor="middle">
      <text x="0" y="0" fill="#0f172a" font-family="'Outfit', sans-serif" font-weight="800" font-size="28" letter-spacing="4">KOREAN PHOTO BOOTH</text>
      <text x="0" y="26" fill="#e11d48" font-family="'Inter', sans-serif" font-weight="600" font-size="15" letter-spacing="2">함께해서 더 특별한 오늘 • MEMORIES</text>
      <text x="0" y="52" fill="#94a3b8" font-family="'JetBrains Mono', monospace" font-size="13">2026.09.11 • PHOTO STUDIO EDITION</text>
    </g>

    <!-- Right Smiley Face Badge -->
    <g transform="translate(1040, 1630)">
      <circle cx="40" cy="40" r="34" fill="#fef08a" stroke="#0f172a" stroke-width="3"/>
      <!-- Eyes -->
      <circle cx="28" cy="32" r="4" fill="#0f172a"/>
      <circle cx="52" cy="32" r="4" fill="#0f172a"/>
      <!-- Smile -->
      <path d="M 26 48 Q 40 64 54 48" fill="none" stroke="#0f172a" stroke-width="3.5" stroke-linecap="round"/>
      <!-- Rosy cheeks -->
      <circle cx="22" cy="42" r="4.5" fill="#f43f5e" opacity="0.5"/>
      <circle cx="58" cy="42" r="4.5" fill="#f43f5e" opacity="0.5"/>
    </g>
  </svg>
  `;
}

// 2. Wedding Luxury Gold (3:2, 1800 x 1200)
function getWeddingLuxurySvg() {
  return `
  <svg width="1800" height="1200" viewBox="0 0 1800 1200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#e8c872"/>
        <stop offset="35%" stop-color="#fff2b2"/>
        <stop offset="70%" stop-color="#c99738"/>
        <stop offset="100%" stop-color="#8a6118"/>
      </linearGradient>
      <filter id="gold-glow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#c99738" flood-opacity="0.35"/>
      </filter>
    </defs>

    <!-- Outer Decorative Borders -->
    <rect x="36" y="36" width="1728" height="1128" fill="none" stroke="url(#gold-grad)" stroke-width="3.5" rx="6" filter="url(#gold-glow)"/>
    <rect x="48" y="48" width="1704" height="1104" fill="none" stroke="url(#gold-grad)" stroke-width="1.2" rx="4" stroke-opacity="0.7"/>

    <!-- Corner Filigree Ornaments (Top Left) -->
    <g transform="translate(56, 56)" stroke="url(#gold-grad)" fill="none" stroke-width="2">
      <path d="M 0 40 C 0 18 18 0 40 0 L 80 0"/>
      <path d="M 0 80 L 0 40"/>
      <circle cx="40" cy="40" r="4" fill="url(#gold-grad)"/>
      <path d="M 12 12 Q 35 15 35 35 Q 15 35 12 12 Z" fill="url(#gold-grad)" fill-opacity="0.4"/>
      <!-- Sparkle -->
      <path d="M 70 20 Q 80 20 80 10 Q 80 20 90 20 Q 80 20 80 30 Q 80 20 70 20 Z" fill="url(#gold-grad)"/>
    </g>

    <!-- Top Right -->
    <g transform="translate(1744, 56) scale(-1, 1)" stroke="url(#gold-grad)" fill="none" stroke-width="2">
      <path d="M 0 40 C 0 18 18 0 40 0 L 80 0"/>
      <path d="M 0 80 L 0 40"/>
      <circle cx="40" cy="40" r="4" fill="url(#gold-grad)"/>
      <path d="M 12 12 Q 35 15 35 35 Q 15 35 12 12 Z" fill="url(#gold-grad)" fill-opacity="0.4"/>
      <path d="M 70 20 Q 80 20 80 10 Q 80 20 90 20 Q 80 20 80 30 Q 80 20 70 20 Z" fill="url(#gold-grad)"/>
    </g>

    <!-- Bottom Left -->
    <g transform="translate(56, 1144) scale(1, -1)" stroke="url(#gold-grad)" fill="none" stroke-width="2">
      <path d="M 0 40 C 0 18 18 0 40 0 L 80 0"/>
      <path d="M 0 80 L 0 40"/>
      <circle cx="40" cy="40" r="4" fill="url(#gold-grad)"/>
      <path d="M 12 12 Q 35 15 35 35 Q 15 35 12 12 Z" fill="url(#gold-grad)" fill-opacity="0.4"/>
    </g>

    <!-- Bottom Right -->
    <g transform="translate(1744, 1144) scale(-1, -1)" stroke="url(#gold-grad)" fill="none" stroke-width="2">
      <path d="M 0 40 C 0 18 18 0 40 0 L 80 0"/>
      <path d="M 0 80 L 0 40"/>
      <circle cx="40" cy="40" r="4" fill="url(#gold-grad)"/>
      <path d="M 12 12 Q 35 15 35 35 Q 15 35 12 12 Z" fill="url(#gold-grad)" fill-opacity="0.4"/>
    </g>

    <!-- Top Crown / Rings Emblem -->
    <g transform="translate(900, 75)" text-anchor="middle">
      <circle cx="-16" cy="0" r="16" fill="none" stroke="url(#gold-grad)" stroke-width="2.5"/>
      <circle cx="16" cy="0" r="16" fill="none" stroke="url(#gold-grad)" stroke-width="2.5"/>
      <path d="M 0 -8 L 0 -18 M -5 -13 L 5 -13" stroke="url(#gold-grad)" stroke-width="2"/>
      <circle cx="0" cy="-22" r="3" fill="url(#gold-grad)"/>
    </g>

    <!-- Bottom Wedding Typography Plaque -->
    <g transform="translate(900, 1110)" text-anchor="middle">
      <!-- Background plaque for ultra-crisp legibility -->
      <rect x="-350" y="-42" width="700" height="66" rx="33" fill="#0f172a" fill-opacity="0.8" stroke="url(#gold-grad)" stroke-width="1.5"/>
      <text x="0" y="-12" fill="url(#gold-grad)" font-family="'Outfit', serif" font-weight="700" font-size="24" letter-spacing="8">
        HAPPY WEDDING
      </text>
      <text x="0" y="14" fill="#f8fafc" font-family="'Inter', sans-serif" font-weight="400" font-size="13" letter-spacing="4">
        FOREVER &amp; ALWAYS • CELEBRATING LOVE
      </text>
    </g>
  </svg>
  `;
}

// 3. Birthday Party (3:2, 1800 x 1200)
function getBirthdayPartySvg() {
  return `
  <svg width="1800" height="1200" viewBox="0 0 1800 1200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Confetti gradients -->
      <linearGradient id="banner-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#f43f5e"/>
        <stop offset="50%" stop-color="#fb7185"/>
        <stop offset="100%" stop-color="#f43f5e"/>
      </linearGradient>
    </defs>

    <!-- Festive Border -->
    <rect x="28" y="28" width="1744" height="1144" fill="none" stroke="#fbbf24" stroke-width="5" rx="20"/>
    <rect x="38" y="38" width="1724" height="1124" fill="none" stroke="#f43f5e" stroke-width="2" rx="14" stroke-dasharray="12 8"/>

    <!-- Top Garland / Bunting String -->
    <path d="M 40 40 Q 450 140 900 60 Q 1350 140 1760 40" fill="none" stroke="#475569" stroke-width="2"/>

    <!-- Pennant / Bunting Flags -->
    <!-- Flag 1 -->
    <polygon points="120,48 180,56 150,130" fill="#f43f5e"/>
    <!-- Flag 2 -->
    <polygon points="230,64 290,75 260,150" fill="#0ea5e9"/>
    <!-- Flag 3 -->
    <polygon points="340,81 400,91 370,165" fill="#eab308"/>
    <!-- Flag 4 -->
    <polygon points="460,94 520,96 490,172" fill="#10b981"/>
    <!-- Flag 5 -->
    <polygon points="580,94 640,89 610,165" fill="#a855f7"/>
    <!-- Flag 6 -->
    <polygon points="700,81 760,73 730,150" fill="#f43f5e"/>
    <!-- Flag 7 -->
    <polygon points="820,66 880,61 850,138" fill="#fb923c"/>
    <!-- Flag 8 -->
    <polygon points="940,61 1000,66 970,138" fill="#38bdf8"/>
    <!-- Flag 9 -->
    <polygon points="1060,73 1120,81 1090,150" fill="#ec4899"/>
    <!-- Flag 10 -->
    <polygon points="1180,89 1240,94 1210,165" fill="#eab308"/>
    <!-- Flag 11 -->
    <polygon points="1300,96 1360,94 1330,172" fill="#10b981"/>
    <!-- Flag 12 -->
    <polygon points="1420,91 1480,81 1450,165" fill="#a855f7"/>
    <!-- Flag 13 -->
    <polygon points="1530,75 1590,64 1560,150" fill="#0ea5e9"/>
    <!-- Flag 14 -->
    <polygon points="1640,56 1700,48 1670,130" fill="#f43f5e"/>

    <!-- Left & Right Confetti bursts -->
    <!-- Left Confetti -->
    <circle cx="80" cy="260" r="8" fill="#f43f5e"/>
    <rect x="95" y="320" width="12" height="12" fill="#eab308" transform="rotate(25 95 320)"/>
    <circle cx="70" cy="400" r="10" fill="#0ea5e9"/>
    <polygon points="110,480 125,510 95,510" fill="#a855f7"/>
    <circle cx="85" cy="590" r="7" fill="#10b981"/>
    <rect x="65" y="700" width="14" height="6" fill="#f43f5e" transform="rotate(45 65 700)"/>
    <circle cx="100" cy="810" r="9" fill="#fb923c"/>
    <polygon points="80,900 95,930 65,930" fill="#38bdf8"/>

    <!-- Right Confetti -->
    <circle cx="1720" cy="260" r="8" fill="#0ea5e9"/>
    <rect x="1695" y="320" width="12" height="12" fill="#f43f5e" transform="rotate(-30 1695 320)"/>
    <circle cx="1730" cy="400" r="10" fill="#eab308"/>
    <polygon points="1690,480 1705,510 1675,510" fill="#10b981"/>
    <circle cx="1715" cy="590" r="7" fill="#a855f7"/>
    <rect x="1725" y="700" width="14" height="6" fill="#fb923c" transform="rotate(-40 1725 700)"/>
    <circle cx="1700" cy="810" r="9" fill="#f43f5e"/>
    <polygon points="1720,900 1735,930 1705,930" fill="#0ea5e9"/>

    <!-- Bottom Party Banner Plaque -->
    <g transform="translate(900, 1105)" text-anchor="middle">
      <rect x="-380" y="-42" width="760" height="70" rx="35" fill="#0f172a" opacity="0.9" stroke="#fbbf24" stroke-width="2"/>
      <text x="0" y="-10" fill="#fbbf24" font-family="'Outfit', sans-serif" font-weight="900" font-size="28" letter-spacing="6">
        🎉 HAPPY BIRTHDAY 🎉
      </text>
      <text x="0" y="16" fill="#ffffff" font-family="'Inter', sans-serif" font-weight="600" font-size="14" letter-spacing="3">
        MAKE A WISH • CELEBRATE TODAY!
      </text>
    </g>

    <!-- Balloon Accents Bottom Left & Right -->
    <g transform="translate(180, 1070)">
      <ellipse cx="0" cy="0" rx="22" ry="28" fill="#f43f5e"/>
      <polygon points="-4,28 4,28 0,33" fill="#f43f5e"/>
      <ellipse cx="28" cy="10" rx="18" ry="24" fill="#fbbf24"/>
      <polygon points="25,34 31,34 28,38" fill="#fbbf24"/>
    </g>
    <g transform="translate(1620, 1070)">
      <ellipse cx="0" cy="0" rx="22" ry="28" fill="#0ea5e9"/>
      <polygon points="-4,28 4,28 0,33" fill="#0ea5e9"/>
      <ellipse cx="-28" cy="10" rx="18" ry="24" fill="#a855f7"/>
      <polygon points="-31,34 -25,34 -28,38" fill="#a855f7"/>
    </g>
  </svg>
  `;
}

// 4. Vintage Polaroid (4:3, 1600 x 1200)
function getPolaroidVintageSvg() {
  return `
  <svg width="1600" height="1200" viewBox="0 0 1600 1200" xmlns="http://www.w3.org/2000/svg">
    <!-- Outer Polaroid Card Border -->
    <!-- Top Border: 50px -->
    <rect x="0" y="0" width="1600" height="50" fill="#f7f5f0"/>
    <!-- Bottom Border: 160px -->
    <rect x="0" y="1040" width="1600" height="160" fill="#f7f5f0"/>
    <!-- Left Border: 50px -->
    <rect x="0" y="50" width="50" height="990" fill="#f7f5f0"/>
    <!-- Right Border: 50px -->
    <rect x="1550" y="50" width="50" height="990" fill="#f7f5f0"/>

    <!-- Subtle inner photo shadow/inset lines -->
    <rect x="50" y="50" width="1500" height="990" fill="none" stroke="#d5cfc4" stroke-width="2"/>

    <!-- Washi Tape strip on top-center -->
    <g transform="translate(730, 20) rotate(-2)">
      <rect x="0" y="0" width="140" height="34" rx="2" fill="#e4d5b7" opacity="0.85"/>
      <line x1="10" y1="0" x2="10" y2="34" stroke="#d2be99" stroke-width="1.5" stroke-dasharray="3 3"/>
      <line x1="130" y1="0" x2="130" y2="34" stroke="#d2be99" stroke-width="1.5" stroke-dasharray="3 3"/>
    </g>

    <!-- Bottom Polaroid Elements -->
    <!-- Camera Icon & Brand on Left -->
    <g transform="translate(100, 1100)">
      <rect x="0" y="0" width="32" height="24" rx="4" fill="#475569"/>
      <circle cx="16" cy="12" r="6" fill="#f7f5f0"/>
      <circle cx="26" cy="6" r="2" fill="#ef4444"/>
      <text x="44" y="17" fill="#475569" font-family="'Inter', sans-serif" font-weight="700" font-size="14" letter-spacing="2">POLAROID INSTANT</text>
    </g>

    <!-- Handwritten Styled Caption (Center) -->
    <g transform="translate(800, 1120)" text-anchor="middle">
      <text x="0" y="0" fill="#1e293b" font-family="'Outfit', 'Brush Script MT', cursive, sans-serif" font-weight="600" font-size="34" letter-spacing="3">
        Original Memories • Vintage Edition
      </text>
      <text x="0" y="28" fill="#64748b" font-family="'JetBrains Mono', monospace" font-size="14" letter-spacing="2">
        EST. 1984 — PHOTOBOOTH STUDIO
      </text>
    </g>

    <!-- Date Stamp on Right (Retro Red ink) -->
    <g transform="translate(1380, 1095)">
      <rect x="0" y="0" width="120" height="38" rx="4" fill="none" stroke="#dc2626" stroke-width="2" opacity="0.8" transform="rotate(-3)"/>
      <text x="60" y="24" fill="#dc2626" font-family="'JetBrains Mono', monospace" font-weight="700" font-size="15" text-anchor="middle" letter-spacing="2" opacity="0.85" transform="rotate(-3 60 24)">
        SEP 2026
      </text>
    </g>
  </svg>
  `;
}

// 5. Cyberpunk Y2K Neon (1:1, 1200 x 1200)
function getY2KNeonSvg() {
  return `
  <svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Neon Glow Filters -->
      <filter id="neon-cyan" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#06b6d4" flood-opacity="0.9"/>
        <feDropShadow dx="0" dy="0" stdDeviation="15" flood-color="#06b6d4" flood-opacity="0.5"/>
      </filter>
      <filter id="neon-pink" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#ec4899" flood-opacity="0.9"/>
        <feDropShadow dx="0" dy="0" stdDeviation="15" flood-color="#ec4899" flood-opacity="0.5"/>
      </filter>
      <!-- Gradient -->
      <linearGradient id="cyber-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#06b6d4"/>
        <stop offset="50%" stop-color="#8b5cf6"/>
        <stop offset="100%" stop-color="#ec4899"/>
      </linearGradient>
    </defs>

    <!-- Outer Neon Borders -->
    <rect x="36" y="36" width="1128" height="1128" fill="none" stroke="#06b6d4" stroke-width="4" rx="16" filter="url(#neon-cyan)"/>
    <rect x="48" y="48" width="1104" height="1104" fill="none" stroke="#ec4899" stroke-width="2" rx="12" stroke-dasharray="24 12" filter="url(#neon-pink)"/>

    <!-- Y2K 4-Point Stars in Corners -->
    <!-- Top Left -->
    <g transform="translate(80, 80)">
      <path d="M 0 -24 Q 0 0 -24 0 Q 0 0 0 24 Q 0 0 24 0 Q 0 0 0 -24 Z" fill="#ffffff" filter="url(#neon-cyan)"/>
    </g>
    <!-- Top Right -->
    <g transform="translate(1120, 80)">
      <path d="M 0 -24 Q 0 0 -24 0 Q 0 0 0 24 Q 0 0 24 0 Q 0 0 0 -24 Z" fill="#ffffff" filter="url(#neon-pink)"/>
    </g>
    <!-- Bottom Left -->
    <g transform="translate(80, 1120)">
      <path d="M 0 -24 Q 0 0 -24 0 Q 0 0 0 24 Q 0 0 24 0 Q 0 0 0 -24 Z" fill="#ffffff" filter="url(#neon-pink)"/>
    </g>
    <!-- Bottom Right -->
    <g transform="translate(1120, 1120)">
      <path d="M 0 -24 Q 0 0 -24 0 Q 0 0 0 24 Q 0 0 24 0 Q 0 0 0 -24 Z" fill="#ffffff" filter="url(#neon-cyan)"/>
    </g>

    <!-- Top Status / REC bar -->
    <g transform="translate(140, 75)">
      <circle cx="0" cy="0" r="6" fill="#ef4444"/>
      <text x="16" y="5" fill="#ef4444" font-family="'JetBrains Mono', monospace" font-weight="700" font-size="16" letter-spacing="2">REC ● 00:24:19</text>
    </g>

    <g transform="translate(1060, 75)" text-anchor="end">
      <text x="0" y="5" fill="#06b6d4" font-family="'JetBrains Mono', monospace" font-weight="700" font-size="15" letter-spacing="2">[ 4K 60FPS ]</text>
    </g>

    <!-- Crosshair / HUD marks -->
    <g stroke="#06b6d4" stroke-width="2" opacity="0.7">
      <line x1="600" y1="60" x2="600" y2="80"/>
      <line x1="600" y1="1120" x2="600" y2="1140"/>
      <line x1="60" y1="600" x2="80" y2="600"/>
      <line x1="1120" y1="600" x2="1140" y2="600"/>
    </g>

    <!-- Bottom Cyber Y2K Typography Banner -->
    <g transform="translate(600, 1105)" text-anchor="middle">
      <rect x="-290" y="-36" width="580" height="58" rx="14" fill="#030712" opacity="0.9" stroke="url(#cyber-grad)" stroke-width="2"/>
      <text x="0" y="-6" fill="#ffffff" font-family="'Outfit', sans-serif" font-weight="900" font-size="22" letter-spacing="6" filter="url(#neon-pink)">
        ✦ Y 2 K   P H O T O B O O T H ✦
      </text>
      <text x="0" y="15" fill="#06b6d4" font-family="'JetBrains Mono', monospace" font-weight="600" font-size="12" letter-spacing="3">
        CYBERSPACE EDITION • PRESS START
      </text>
    </g>
  </svg>
  `;
}

// 6. Studio Pro Minimalist (3:2, 1800 x 1200)
function getStudioProSvg() {
  return `
  <svg width="1800" height="1200" viewBox="0 0 1800 1200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="studio-shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000000" flood-opacity="0.4"/>
      </filter>
    </defs>

    <!-- Outer sleek borders -->
    <rect x="28" y="28" width="1744" height="1144" fill="none" stroke="#f43f5e" stroke-width="6" rx="18" opacity="0.9"/>
    <rect x="42" y="42" width="1716" height="1116" fill="none" stroke="#38bdf8" stroke-width="2" rx="12" opacity="0.6"/>

    <!-- Viewfinder Corner HUD brackets -->
    <!-- Top Left -->
    <path d="M 60 100 L 60 60 L 100 60" fill="none" stroke="#ffffff" stroke-width="3"/>
    <!-- Top Right -->
    <path d="M 1740 100 L 1740 60 L 1700 60" fill="none" stroke="#ffffff" stroke-width="3"/>
    <!-- Bottom Left -->
    <path d="M 60 1100 L 60 1140 L 100 1140" fill="none" stroke="#ffffff" stroke-width="3"/>
    <!-- Bottom Right -->
    <path d="M 1740 1100 L 1740 1140 L 1700 1140" fill="none" stroke="#ffffff" stroke-width="3"/>

    <!-- Technical Exposure Marks (Top Left & Top Right) -->
    <g transform="translate(80, 85)">
      <text x="0" y="0" fill="#94a3b8" font-family="'JetBrains Mono', monospace" font-size="14" font-weight="600" letter-spacing="2">
        RAW • ISO 100 • 50mm f/1.8 • 1/160s
      </text>
    </g>

    <g transform="translate(1720, 85)" text-anchor="end">
      <circle cx="-120" cy="-4" r="5" fill="#10b981"/>
      <text x="0" y="0" fill="#e2e8f0" font-family="'JetBrains Mono', monospace" font-size="14" font-weight="700" letter-spacing="2">
        PRO CALIBRATED
      </text>
    </g>

    <!-- Bottom Studio Plaque -->
    <g transform="translate(900, 1115)" text-anchor="middle" filter="url(#studio-shadow)">
      <rect x="-340" y="-36" width="680" height="56" rx="28" fill="#0f172a" opacity="0.95" stroke="#f43f5e" stroke-width="2"/>
      <text x="0" y="-8" fill="#ffffff" font-family="'Outfit', sans-serif" font-weight="800" font-size="22" letter-spacing="6">
        PHOTOBOOTH STUDIO PRO
      </text>
      <text x="0" y="12" fill="#94a3b8" font-family="'Inter', sans-serif" font-weight="500" font-size="12" letter-spacing="3">
        OFFICIAL PORTRAIT EDITION • 2026
      </text>
    </g>
  </svg>
  `;
}

const TEMPLATES = [
  {
    id: 'preset_korean_4cut',
    fileName: 'frame_korean_4cut.png',
    getSvg: getKorean4CutSvg
  },
  {
    id: 'preset_wedding_luxury',
    fileName: 'frame_wedding_luxury.png',
    getSvg: getWeddingLuxurySvg
  },
  {
    id: 'preset_birthday_party',
    fileName: 'frame_birthday_party.png',
    getSvg: getBirthdayPartySvg
  },
  {
    id: 'preset_polaroid_vintage',
    fileName: 'frame_polaroid_vintage.png',
    getSvg: getPolaroidVintageSvg
  },
  {
    id: 'preset_y2k_neon',
    fileName: 'frame_y2k_neon.png',
    getSvg: getY2KNeonSvg
  },
  {
    id: 'preset_studio_pro',
    fileName: 'frame_studio_pro.png',
    getSvg: getStudioProSvg
  }
];

async function generateAllTemplates() {
  ensureTemplatesDir();
  console.log('[TemplateGenerator] Generating sample photobooth templates in:', TEMPLATES_DIR);

  for (const t of TEMPLATES) {
    const filePath = path.join(TEMPLATES_DIR, t.fileName);
    const svgStr = t.getSvg();
    const buffer = Buffer.from(svgStr.trim());
    await sharp(buffer).png({ compressionLevel: 8 }).toFile(filePath);
    console.log(`[TemplateGenerator]  Created ${t.fileName}`);
  }

  console.log('[TemplateGenerator] All 6 preset templates generated successfully!');
}

if (require.main === module) {
  generateAllTemplates().catch(err => {
    console.error('[TemplateGenerator] Error generating templates:', err);
    process.exit(1);
  });
}

module.exports = {
  generateAllTemplates,
  TEMPLATES
};
