import { DM_Mono, DM_Sans, Manrope } from "next/font/google"

// grinflow type families (see app/tokens.css). Both root layouts put
// `fontVariables` on <html> (the :root tokens need them there) so the --font-gf-* variables resolve everywhere.
const display = Manrope({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-gf-display" })
const sans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-gf-sans" })
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-gf-mono" })

export const fontVariables = `${display.variable} ${sans.variable} ${mono.variable}`
