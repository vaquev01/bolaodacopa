"use client";

import { useEffect } from "react";
import { polyfillCountryFlagEmojis } from "country-flag-emoji-polyfill";

/**
 * Windows não renderiza emoji de bandeira (vira sigla "BR" ou bloco).
 * Este polyfill injeta a font "Twemoji Country Flags" (~80KB woff2)
 * APENAS quando detecta que o sistema não suporta — Mac/iOS/Android
 * continuam com o emoji nativo, custo zero.
 */
export default function EmojiFlagPolyfill() {
  useEffect(() => {
    polyfillCountryFlagEmojis();
  }, []);
  return null;
}
