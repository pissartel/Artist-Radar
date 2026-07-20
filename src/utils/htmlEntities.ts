// Shared HTML entity decoding for source-derived text (scraped titles,
// descriptions, page metadata). Never render raw entities like "&eacute;" or
// "&#39;" to the user; always decode through this module first.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  agrave: "à",
  acirc: "â",
  auml: "ä",
  aring: "å",
  ccedil: "ç",
  ocirc: "ô",
  ouml: "ö",
  ograve: "ò",
  oelig: "œ",
  ucirc: "û",
  uuml: "ü",
  ugrave: "ù",
  iuml: "ï",
  icirc: "î",
  igrave: "ì",
  ntilde: "ñ",
  aelig: "æ",
  szlig: "ß",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™"
};

/** Decodes named, decimal (&#39;) and hexadecimal (&#x27;) HTML entities in `value`. */
export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}
