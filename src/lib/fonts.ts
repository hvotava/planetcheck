import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";

export const inter = Inter({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-inter", display: "swap" });
export const spaceGrotesk = Space_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-space-grotesk", display: "swap", weight: ["500", "700"] });
export const jetbrains = JetBrains_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-jetbrains", display: "swap", weight: ["400", "600"] });

export const fontClassName = `${inter.variable} ${spaceGrotesk.variable} ${jetbrains.variable}`;
