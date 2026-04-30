/**
 * Curated Google Fonts manifest — ~200 popular fonts with available styles.
 * Bundled statically so the font picker opens instantly (no API call).
 *
 * Each entry: { family, styles[], category, variable? }
 * Styles use Google Fonts naming: "Regular", "Italic", "Bold", "Bold Italic", etc.
 */

export interface FontMeta {
    family: string
    styles: string[]
    category: 'sans-serif' | 'serif' | 'monospace' | 'display' | 'handwriting'
    variable?: boolean
}

export const FONT_MANIFEST: FontMeta[] = [
    // ─── Popular Sans-Serif ──────────────────────────────────────────────────
    { family: 'Inter', styles: ['Thin', 'Extra Light', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold', 'Extra Bold', 'Black'], category: 'sans-serif', variable: true },
    { family: 'Roboto', styles: ['Thin', 'Thin Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Bold', 'Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif' },
    { family: 'Open Sans', styles: ['Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic'], category: 'sans-serif', variable: true },
    { family: 'Lato', styles: ['Thin', 'Thin Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Bold', 'Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif' },
    { family: 'Montserrat', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Poppins', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif' },
    { family: 'Nunito', styles: ['Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Raleway', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'DM Sans', styles: ['Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Manrope', styles: ['Extra Light', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold', 'Extra Bold'], category: 'sans-serif', variable: true },
    { family: 'Outfit', styles: ['Thin', 'Extra Light', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold', 'Extra Bold', 'Black'], category: 'sans-serif', variable: true },
    { family: 'Plus Jakarta Sans', styles: ['Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic'], category: 'sans-serif', variable: true },
    { family: 'Figtree', styles: ['Light', 'Regular', 'Medium', 'Semi Bold', 'Bold', 'Extra Bold', 'Black', 'Light Italic', 'Italic', 'Medium Italic', 'Semi Bold Italic', 'Bold Italic', 'Extra Bold Italic', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Source Sans 3', styles: ['Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Work Sans', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Nunito Sans', styles: ['Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Rubik', styles: ['Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Karla', styles: ['Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic'], category: 'sans-serif', variable: true },
    { family: 'Cabin', styles: ['Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic'], category: 'sans-serif', variable: true },
    { family: 'Barlow', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif' },
    { family: 'Mulish', styles: ['Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'IBM Plex Sans', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic'], category: 'sans-serif' },
    { family: 'Noto Sans', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Josefin Sans', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic'], category: 'sans-serif', variable: true },
    { family: 'Quicksand', styles: ['Light', 'Regular', 'Medium', 'Semi Bold', 'Bold'], category: 'sans-serif', variable: true },
    { family: 'PT Sans', styles: ['Regular', 'Italic', 'Bold', 'Bold Italic'], category: 'sans-serif' },
    { family: 'Lexend', styles: ['Thin', 'Extra Light', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold', 'Extra Bold', 'Black'], category: 'sans-serif', variable: true },
    { family: 'Libre Franklin', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Hind', styles: ['Light', 'Regular', 'Medium', 'Semi Bold', 'Bold'], category: 'sans-serif' },
    { family: 'Oxygen', styles: ['Light', 'Regular', 'Bold'], category: 'sans-serif' },
    { family: 'Catamaran', styles: ['Thin', 'Extra Light', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold', 'Extra Bold', 'Black'], category: 'sans-serif', variable: true },
    { family: 'Exo 2', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Sora', styles: ['Thin', 'Extra Light', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold', 'Extra Bold'], category: 'sans-serif', variable: true },
    { family: 'Overpass', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Archivo', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Albert Sans', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Space Grotesk', styles: ['Light', 'Regular', 'Medium', 'Semi Bold', 'Bold'], category: 'sans-serif', variable: true },
    { family: 'Bricolage Grotesque', styles: ['Extra Light', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold', 'Extra Bold'], category: 'sans-serif', variable: true },
    { family: 'Geist', styles: ['Thin', 'Ultra Light', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold', 'Ultra Bold', 'Black'], category: 'sans-serif', variable: true },
    { family: 'Geist Mono', styles: ['Thin', 'Ultra Light', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold', 'Ultra Bold', 'Black'], category: 'monospace', variable: true },
    { family: 'Instrument Sans', styles: ['Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic'], category: 'sans-serif', variable: true },
    { family: 'General Sans', styles: ['Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic'], category: 'sans-serif' },
    { family: 'Satoshi', styles: ['Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Bold', 'Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif' },
    { family: 'Urbanist', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Red Hat Display', styles: ['Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif', variable: true },
    { family: 'Be Vietnam Pro', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'sans-serif' },

    // ─── Serif ───────────────────────────────────────────────────────────────
    { family: 'Merriweather', styles: ['Light', 'Light Italic', 'Regular', 'Italic', 'Bold', 'Bold Italic', 'Black', 'Black Italic'], category: 'serif' },
    { family: 'Playfair Display', styles: ['Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'serif', variable: true },
    { family: 'Lora', styles: ['Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic'], category: 'serif', variable: true },
    { family: 'EB Garamond', styles: ['Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic'], category: 'serif', variable: true },
    { family: 'Cormorant Garamond', styles: ['Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic'], category: 'serif' },
    { family: 'DM Serif Display', styles: ['Regular', 'Italic'], category: 'serif' },
    { family: 'Fraunces', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'serif', variable: true },
    { family: 'PT Serif', styles: ['Regular', 'Italic', 'Bold', 'Bold Italic'], category: 'serif' },
    { family: 'Noto Serif', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'serif', variable: true },
    { family: 'Libre Baskerville', styles: ['Regular', 'Italic', 'Bold'], category: 'serif' },
    { family: 'Crimson Text', styles: ['Regular', 'Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic'], category: 'serif' },
    { family: 'Source Serif 4', styles: ['Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'serif', variable: true },
    { family: 'Bitter', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'serif', variable: true },
    { family: 'Vollkorn', styles: ['Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'serif', variable: true },
    { family: 'Instrument Serif', styles: ['Regular', 'Italic'], category: 'serif' },
    { family: 'Zilla Slab', styles: ['Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic'], category: 'serif' },
    { family: 'Cardo', styles: ['Regular', 'Italic', 'Bold'], category: 'serif' },
    { family: 'Spectral', styles: ['Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic'], category: 'serif' },
    { family: 'Roboto Slab', styles: ['Thin', 'Extra Light', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold', 'Extra Bold', 'Black'], category: 'serif', variable: true },

    // ─── Monospace ───────────────────────────────────────────────────────────
    { family: 'JetBrains Mono', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic'], category: 'monospace', variable: true },
    { family: 'Fira Code', styles: ['Light', 'Regular', 'Medium', 'Semi Bold', 'Bold'], category: 'monospace', variable: true },
    { family: 'Source Code Pro', styles: ['Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'monospace', variable: true },
    { family: 'IBM Plex Mono', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic'], category: 'monospace' },
    { family: 'Roboto Mono', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic'], category: 'monospace', variable: true },
    { family: 'Space Mono', styles: ['Regular', 'Italic', 'Bold', 'Bold Italic'], category: 'monospace' },
    { family: 'Inconsolata', styles: ['Extra Light', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold', 'Extra Bold', 'Black'], category: 'monospace', variable: true },
    { family: 'Ubuntu Mono', styles: ['Regular', 'Italic', 'Bold', 'Bold Italic'], category: 'monospace' },
    { family: 'DM Mono', styles: ['Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic'], category: 'monospace' },
    { family: 'Azeret Mono', styles: ['Thin', 'Thin Italic', 'Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic', 'Extra Bold', 'Extra Bold Italic', 'Black', 'Black Italic'], category: 'monospace', variable: true },

    // ─── Display / Creative ──────────────────────────────────────────────────
    { family: 'Oswald', styles: ['Extra Light', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold'], category: 'display', variable: true },
    { family: 'Comfortaa', styles: ['Light', 'Regular', 'Medium', 'Semi Bold', 'Bold'], category: 'display', variable: true },
    { family: 'Abril Fatface', styles: ['Regular'], category: 'display' },
    { family: 'Righteous', styles: ['Regular'], category: 'display' },
    { family: 'Bebas Neue', styles: ['Regular'], category: 'display' },
    { family: 'Passion One', styles: ['Regular', 'Bold', 'Black'], category: 'display' },
    { family: 'Anton', styles: ['Regular'], category: 'display' },
    { family: 'Bungee', styles: ['Regular'], category: 'display' },
    { family: 'Press Start 2P', styles: ['Regular'], category: 'display' },
    { family: 'Monoton', styles: ['Regular'], category: 'display' },
    { family: 'Orbitron', styles: ['Regular', 'Medium', 'Semi Bold', 'Bold', 'Extra Bold', 'Black'], category: 'display', variable: true },
    { family: 'Permanent Marker', styles: ['Regular'], category: 'display' },
    { family: 'Russo One', styles: ['Regular'], category: 'display' },
    { family: 'Teko', styles: ['Light', 'Regular', 'Medium', 'Semi Bold', 'Bold'], category: 'display', variable: true },
    { family: 'Fredoka', styles: ['Light', 'Regular', 'Medium', 'Semi Bold', 'Bold'], category: 'display', variable: true },
    { family: 'Titan One', styles: ['Regular'], category: 'display' },
    { family: 'Lilita One', styles: ['Regular'], category: 'display' },
    { family: 'Pacifico', styles: ['Regular'], category: 'handwriting' },
    { family: 'Caveat', styles: ['Regular', 'Medium', 'Semi Bold', 'Bold'], category: 'handwriting', variable: true },
    { family: 'Dancing Script', styles: ['Regular', 'Medium', 'Semi Bold', 'Bold'], category: 'handwriting', variable: true },
    { family: 'Kalam', styles: ['Light', 'Regular', 'Bold'], category: 'handwriting' },
    { family: 'Satisfy', styles: ['Regular'], category: 'handwriting' },
    { family: 'Great Vibes', styles: ['Regular'], category: 'handwriting' },
    { family: 'Indie Flower', styles: ['Regular'], category: 'handwriting' },
    { family: 'Shadows Into Light', styles: ['Regular'], category: 'handwriting' },
    { family: 'Sacramento', styles: ['Regular'], category: 'handwriting' },
    { family: 'Architects Daughter', styles: ['Regular'], category: 'handwriting' },
    { family: 'Lobster', styles: ['Regular'], category: 'display' },
    { family: 'Lobster Two', styles: ['Regular', 'Italic', 'Bold', 'Bold Italic'], category: 'display' },
    { family: 'Alfa Slab One', styles: ['Regular'], category: 'display' },
    { family: 'Bai Jamjuree', styles: ['Extra Light', 'Extra Light Italic', 'Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic'], category: 'sans-serif' },
    { family: 'Chakra Petch', styles: ['Light', 'Light Italic', 'Regular', 'Italic', 'Medium', 'Medium Italic', 'Semi Bold', 'Semi Bold Italic', 'Bold', 'Bold Italic'], category: 'sans-serif' },

    // ─── System fallbacks ────────────────────────────────────────────────────
    { family: 'system-ui', styles: ['Regular', 'Italic', 'Bold', 'Bold Italic'], category: 'sans-serif' },
    { family: 'sans-serif', styles: ['Regular'], category: 'sans-serif' },
    { family: 'serif', styles: ['Regular'], category: 'serif' },
    { family: 'monospace', styles: ['Regular'], category: 'monospace' },
]

/** Build a lookup map for O(1) access. */
const _fontMap = new Map<string, FontMeta>()
for (const f of FONT_MANIFEST) _fontMap.set(f.family.toLowerCase(), f)

export function getFontMeta(family: string): FontMeta | undefined {
    return _fontMap.get(family.toLowerCase())
}
