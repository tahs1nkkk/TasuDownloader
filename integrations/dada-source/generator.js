import { BADGES, CATEGORY_DEFS, CATEGORY_LINES, COMBO_LINES, FREAKY_EMOJI, PIN_LINES, PRESET_LINES, TONE_OPENERS } from "./comment-bank.js?v=8";

import { TONE_LINES } from "./comment-bank.js?v=8";

const MAX_BYTES = 500;
const TARGET_BYTES = 475;
const encoder = new TextEncoder();

const TURKISH_ASCII = new Map([
  ["\u00e7", "c"],
  ["\u00c7", "C"],
  ["\u011f", "g"],
  ["\u011e", "G"],
  ["\u0131", "i"],
  ["\u0130", "I"],
  ["\u00f6", "o"],
  ["\u00d6", "O"],
  ["\u015f", "s"],
  ["\u015e", "S"],
  ["\u00fc", "u"],
  ["\u00dc", "U"]
]);

const RISK_RULES = [
  { label: "link veya sosyal medya", pattern: /(https?:\/\/|www\.|\.com\b|\.gg\b|discord|snapchat|instagram|tiktok|telegram|whatsapp|youtube|@)/i },
  { label: "kisisel bilgi veya uzun sayi", pattern: /\b(phone|telefon|adres|address|email|mail|gmail|hotmail|yas|age)\b|\b\d{3,}\b/i },
  { label: "para/kumar imasi", pattern: /\b(real money|cashout|cash out|para yatir|bahis|bet|casino|kumar|jackpot)\b/i },
  { label: "sert hakaret veya zarar", pattern: /\b(salak|aptal|ezik|trash|idiot|stupid|hate|kill|oldur|yok ol)\b/i },
  { label: "flort veya yas riski", pattern: /\b(date|dating|flirt|sevgili|romance|askim|bebegim)\b/i },
  { label: "fazla sahiplenici rol", pattern: /\b(hizmetci|hizmetÃ§isi|hizmetcisi|transfer)\b/i }
];

export function utf8ByteLength(text) {
  return encoder.encode(text || "").length;
}

export function toAsciiSafe(text) {
  return Array.from(text || "")
    .map((char) => TURKISH_ASCII.get(char) || char)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function removeEmoji(text) {
  return (text || "").replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, "");
}

export function cleanSpaces(text) {
  return (text || "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

export function findRiskTerms(text) {
  const value = text || "";
  return RISK_RULES.filter((rule) => rule.pattern.test(value)).map((rule) => rule.label);
}

export function fitToByteLimit(text, maxBytes) {
  const limit = MAX_BYTES;
  if (utf8ByteLength(text) <= limit) return text;

  const words = cleanSpaces(text).replace(/\n/g, " \n ").split(/\s+/);
  let result = "";
  for (const word of words) {
    const token = word === "\\n" ? "\n" : word;
    const separator = !result || result.endsWith("\n") || token === "\n" ? "" : " ";
    const next = token === "\n" ? `${result}\n` : `${result}${separator}${token}`;
    if (utf8ByteLength(next) > limit) break;
    result = next;
  }

  if (result) {
    const cleaned = result.replace(/[,.!?;:]$/, "").trim();
    return utf8ByteLength(`${cleaned}.`) <= limit ? `${cleaned}.` : cleaned;
  }

  let chars = "";
  for (const char of Array.from(text)) {
    if (utf8ByteLength(chars + char) > limit) break;
    chars += char;
  }
  return chars.trim();
}

export function generateReview(input) {
  const ratings = normalizeRatings(input.ratings);
  const maxBytes = MAX_BYTES;
  const tone = TONE_OPENERS[input.tone] ? input.tone : "classic";
  const style = PRESET_LINES[input.style] ? input.style : "dada";
  const effectiveTone = tone;
  const history = Array.isArray(input.history) ? input.history : [];
  const options = {
    ascii: input.ascii === true,
    emoji: input.emoji === true || input.noEmoji === false,
    gender: normalizeGender(input.gender),
    includeNote: input.includeNote === true,
    includeBadge: input.includeBadge === true
  };

  const average = CATEGORY_DEFS.reduce((sum, category) => sum + effectiveRating(category.id, ratings[category.id]), 0) / CATEGORY_DEFS.length;
  const score = Math.min(10, Math.max(1, Math.round(average * 2)));
  const targetBytes = options.ascii ? 485 : TARGET_BYTES;
  const attempts = [];
  let bestFull = null;
  let bestAny = null;

  for (let i = 0; i < 120; i += 1) {
    const opener = pick(TONE_OPENERS[effectiveTone], `${effectiveTone}:${score}:${i}`).replace("{score}", String(score));
    const sectionLines = CATEGORY_DEFS.map((category) => ({
      ...category,
      value: ratings[category.id],
      line: pickLine(category.id, effectiveRating(category.id, ratings[category.id]), `${style}:${effectiveTone}:${i}:${category.id}`, effectiveTone, style)
    }));
    const pin = pick(PIN_LINES, `pin:${i}:${score}`);
    const badge = pick(BADGES, `badge:${i}:${score}`);
    const spice = options.emoji ? pickEmojiPair(i) : "";

    const candidates = buildCandidates({
      opener,
      sectionLines,
      pin,
      badge,
      spice,
      score,
      options
    });

    for (const candidate of candidates) {
      const finalText = postProcess(candidate, maxBytes, options, false);
      const risks = findRiskTerms(finalText);
      const signature = makeSignature(finalText);
      const bytes = utf8ByteLength(finalText);
      const isFull = candidate.kind === "full";
      attempts.push(finalText);

      if (history.includes(signature)) continue;
      if (bytes > maxBytes) continue;
      const result = {
        text: finalText,
        bytes,
        risks,
        signature
      };
      if (isFull && (!bestFull || result.bytes > bestFull.bytes)) bestFull = result;
      if (!bestAny || result.bytes > bestAny.bytes) bestAny = result;
      if (isFull && result.bytes >= targetBytes) return result;
    }
  }

  if (bestFull) return bestFull;

  const fallback = postProcess(buildFixedFullFallback({ ratings, score, tone: effectiveTone, options }), maxBytes, options, false);

  return {
    text: fallback,
    bytes: utf8ByteLength(fallback),
    risks: findRiskTerms(fallback),
    signature: makeSignature(fallback)
  };
}

function buildCandidates(parts) {
  const [kisilik, avatar, uzme] = parts.sectionLines;
  const emojiSuffix = parts.spice ? ` ${parts.spice}` : "";
  const opener = `${parts.opener}${emojiSuffix}`;
  const exactPin = parts.pin;
  const badge = parts.badge;
  const sections = [kisilik, avatar, uzme];

  return [
    makeFullCandidate(opener, sections.map((section) => ({
      ...section,
      line: extendLine(section.line, section.id, section.value, "long")
    })), exactPin, badge, parts.options),
    makeFullCandidate(opener, sections.map((section) => ({
      ...section,
      line: extendLine(section.line, section.id, section.value, "large")
    })), exactPin, badge, parts.options),
    makeFullCandidate(opener, sections.map((section, index) => ({
      ...section,
      line: extendLine(section.line, section.id, section.value, index < 2 ? "large" : "medium")
    })), exactPin, badge, parts.options),
    makeFullCandidate(opener, sections.map((section, index) => ({
      ...section,
      line: extendLine(section.line, section.id, section.value, index > 0 ? "large" : "medium")
    })), exactPin, badge, parts.options),
    makeFullCandidate(opener, sections.map((section) => ({
      ...section,
      line: extendLine(section.line, section.id, section.value, "medium")
    })), exactPin, badge, parts.options),
    makeFullCandidate(opener, sections, exactPin, badge, parts.options),
    makeFullCandidate(opener, sections.map((section) => ({
      ...section,
      line: shortenLine(section.line, 74)
    })), exactPin, badge, parts.options),
    makeFullCandidate(opener, sections.map((section) => ({
      ...section,
      line: fallbackLine(section.id)
    })), exactPin, badge, parts.options)
  ];
}

function extendLine(line, categoryId, value, level) {
  const rating = clampNumber(value, 1, 5);
  const mood = rating <= 2 ? "low" : rating >= 4 ? "high" : "mid";
  const suffixes = {
    kisilik: {
      low: {
        medium: "dada bunu hemen unutmadi",
        large: "dada bunu hemen unutmadi, miyav tarafini daha yakindan izleyecek",
        long: "dada bunu hemen unutmayip miyav disiplinini ayrica izlemeye aldi"
      },
      mid: {
        medium: "dada simdilik izlemeye devam ediyor",
        large: "dada simdilik izlemeye devam ediyor, rahatlamasina izin vermiyor",
        long: "dada simdilik izlemeye devam ediyor, fazla rahatlamasina da izin vermiyor"
      },
      high: {
        medium: "dada bu enerjiyi not etti",
        large: "dada bu enerjiyi not etti ve ilgiyi biraz daha yukari cekti",
        long: "dada bu enerjiyi not etti, digerlerinden biraz daha ayri tuttu"
      }
    },
    avatar: {
      low: {
        medium: "drip tarafi daha toparlanmali",
        large: "drip tarafi daha toparlanmali, dada bunu hemen onaylamadi",
        long: "drip tarafi daha toparlanmali, dada robuxu burada kolay acilmaz"
      },
      mid: {
        medium: "dada son dokunusu bekliyor",
        large: "dada son dokunusu bekliyor, kombin daha net durmali",
        long: "dada son dokunusu bekliyor, kombin daha net konusabilir"
      },
      high: {
        medium: "dada bu kombini onayladi",
        large: "dada bu kombini onayladi, drip tarafini da ayrica begendi",
        long: "dada bu kombini onayladi, robux burada bosuna harcanmis durmuyor"
      }
    },
    uzme: {
      low: {
        medium: "miyav takvimi duzelmeli",
        large: "miyav takvimi duzelmeli, dada ilgisi bu sekilde acilmaz",
        long: "miyav takvimi duzelmeli, yoksa dada ilgisi bu kadar kolay acilmaz"
      },
      mid: {
        medium: "dada dengeyi takip ediyor",
        large: "dada dengeyi takip ediyor, uslu kedicik modu kalici olmali",
        long: "dada dengeyi takip ediyor, uslu kedicik modu kalici olmali"
      },
      high: {
        medium: "dada bundan memnun kaldi",
        large: "dada bundan memnun kaldi, ilgisini geri cekmek istemedi",
        long: "dada bundan memnun kaldi, miyav performansi ilgiyi hak ettirdi"
      }
    }
  };
  const suffix = suffixes[categoryId]?.[mood]?.[level];
  return suffix ? `${line}, ${suffix}` : line;
}

function makeCandidate(kind, lines) {
  return { kind, text: lines.join("\n") };
}

function makeFullCandidate(opener, sections, pin, badge, options) {
  const [kisilik, avatar, uzme] = sections;
  const lines = [
    opener,
    "",
    "--- Ki\u015filik ---",
    `${stars(kisilik.value)} ${kisilik.value} Puan`,
    `${kisilik.line}.`,
    "",
    "--- Avatar ---",
    `${stars(avatar.value)} ${avatar.value} Puan`,
    `${avatar.line}.`,
    "",
    "--- Dadas\u0131n\u0131 \u00dczmeme ---",
    `${stars(uzme.value)} ${uzme.value} Puan`,
    `${uzme.line}.`
  ];
  if (options.includeNote || options.includeBadge) lines.push("");
  if (options.includeNote) lines.push(pin);
  if (options.includeBadge) lines.push(badge);
  return makeCandidate("full", lines);
}

function buildFixedFullFallback({ ratings, score, tone, options }) {
  const opener = pick(TONE_OPENERS[tone], `fallback:${tone}:${score}`).replace("{score}", String(score));
  const pin = pick(PIN_LINES, `fallback:pin:${score}`);
  const badge = pick(BADGES, `fallback:badge:${score}`);
  const sections = CATEGORY_DEFS.map((category) => ({
    ...category,
    value: ratings[category.id],
    line: fallbackLine(category.id)
  }));
  return makeFullCandidate(opener, sections, pin, badge, options);
}

function fallbackLine(categoryId) {
  const lines = {
    kisilik: "dada alt metni gördü, kedicik rolü şimdilik şüpheli",
    avatar: "drip var ama dada bunun arkasındaki robuxu unutmadı",
    uzme: "miyav dengesi net değil; dada bunu fazla masum saymadı"
  };
  return lines[categoryId] || lines.kisilik;
}

function shortenLine(line, maxChars) {
  const words = cleanSpaces(line).split(" ");
  let result = "";
  for (const word of words) {
    const next = result ? `${result} ${word}` : word;
    if (Array.from(next).length > maxChars) break;
    result = next;
  }
  const cleaned = result.replace(/[,.!?;:]$/, "");
  if (!cleaned || cleaned === line) return line;
  return `${cleaned}...`;
}

function normalizeRatings(ratings) {
  const source = ratings || {};
  return Object.fromEntries(CATEGORY_DEFS.map((category) => {
    const value = Number(source[category.id] ?? 3);
    return [category.id, Math.min(5, Math.max(1, Number.isFinite(value) ? Math.round(value) : 3))];
  }));
}

function effectiveRating(categoryId, value) {
  const rating = clampNumber(value, 1, 5);
  return rating;
}

function stars(value) {
  const rating = clampNumber(value, 1, 5);
  return `${"\u2605".repeat(rating)}${"\u2606".repeat(5 - rating)}`;
}

function pickEmojiPair(salt) {
  const first = pick(FREAKY_EMOJI, `emoji:a:${salt}`);
  const second = pick(FREAKY_EMOJI, `emoji:b:${salt}`);
  return first === second ? first : `${first}${second}`;
}

function pickLine(categoryId, star, salt, tone, style) {
  const comboCategory = COMBO_LINES[`${tone}:${style}`]?.[categoryId];
  const comboLines = comboCategory?.[clampNumber(star, 1, 5)] || comboCategory?.[nearestToneStar(star)];
  if (comboLines?.length) return pick(comboLines, salt);

  const presetCategory = PRESET_LINES[style]?.[categoryId];
  const presetLines = presetCategory?.[clampNumber(star, 1, 5)] || presetCategory?.[nearestToneStar(star)];
  if (presetLines?.length) return pick(presetLines, salt);

  const toneCategory = TONE_LINES[tone]?.[categoryId];
  const toneLines = toneCategory?.[clampNumber(star, 1, 5)] || toneCategory?.[nearestToneStar(star)];
  if (toneLines?.length) return pick(toneLines, salt);

  const category = CATEGORY_LINES[categoryId] || CATEGORY_LINES.kisilik;
  const lines = category[clampNumber(star, 1, 5)] || category[3];
  return pick(lines, salt);
}

function nearestToneStar(star) {
  const rating = clampNumber(star, 1, 5);
  if (rating <= 2) return 1;
  if (rating >= 4) return 5;
  return 3;
}

function pick(values, salt) {
  if (!values || values.length === 0) return "";
  return values[pickIndex(values.length, salt)];
}

function pickIndex(length, salt) {
  const randomPart = cryptoRandom();
  const saltPart = hashString(String(salt));
  return (randomPart + saltPart) % length;
}

function cryptoRandom() {
  if (globalThis.crypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return buffer[0];
  }
  return Math.floor(Math.random() * 2 ** 32);
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function postProcess(text, maxBytes, options, shouldFit = true) {
  let result = cleanSpaces(typeof text === "string" ? text : text.text);
  result = applyGender(result, options.gender);
  if (!options.emoji) result = removeEmoji(result);
  if (options.ascii) result = toAsciiSafe(result);
  result = cleanRepeatedRoleWords(result);
  result = cleanSpaces(result);
  return shouldFit ? fitToByteLimit(result, maxBytes) : result;
}

function cleanRepeatedRoleWords(text) {
  return text
    .replace(/(?:küçük\s+){2,}kızıma/g, "küçük kızıma")
    .replace(/(?:küçük\s+){2,}kızımı/g, "küçük kızımı")
    .replace(/(?:küçük\s+){2,}kızımın/g, "küçük kızımın")
    .replace(/(?:küçük\s+){2,}kızımda/g, "küçük kızımda")
    .replace(/(?:küçük\s+){2,}kızımla/g, "küçük kızımla")
    .replace(/(?:küçük\s+){2,}kızım/g, "küçük kızım")
    .replace(/(?:küçük\s+){2,}kızlarımdan/g, "küçük kızlarımdan")
    .replace(/(?:küçük\s+){2,}kızlarım/g, "küçük kızlarım")
    .replace(/(?:küçük\s+){2,}kızlardan/g, "küçük kızlardan")
    .replace(/(?:küçük\s+){2,}kız/g, "küçük kız")
    .replace(/(?:küçük\s+){2,}oğluşuma/g, "küçük oğluşuma")
    .replace(/(?:küçük\s+){2,}oğluşumu/g, "küçük oğluşumu")
    .replace(/(?:küçük\s+){2,}oğluşumun/g, "küçük oğluşumun")
    .replace(/(?:küçük\s+){2,}oğluşumda/g, "küçük oğluşumda")
    .replace(/(?:küçük\s+){2,}oğluşumla/g, "küçük oğluşumla")
    .replace(/(?:küçük\s+){2,}oğluşum/g, "küçük oğluşum")
    .replace(/(?:küçük\s+){2,}oğluşlarımdan/g, "küçük oğluşlarımdan")
    .replace(/(?:küçük\s+){2,}oğluşlarım/g, "küçük oğluşlarım")
    .replace(/(?:küçük\s+){2,}oğluşlardan/g, "küçük oğluşlardan")
    .replace(/(?:küçük\s+){2,}oğluş/g, "küçük oğluş")
    .replace(/(?:kucuk\s+){2,}kizima/g, "kucuk kizima")
    .replace(/(?:kucuk\s+){2,}kizimi/g, "kucuk kizimi")
    .replace(/(?:kucuk\s+){2,}kizimin/g, "kucuk kizimin")
    .replace(/(?:kucuk\s+){2,}kizimda/g, "kucuk kizimda")
    .replace(/(?:kucuk\s+){2,}kizimla/g, "kucuk kizimla")
    .replace(/(?:kucuk\s+){2,}kizim/g, "kucuk kizim")
    .replace(/(?:kucuk\s+){2,}kizlarimdan/g, "kucuk kizlarimdan")
    .replace(/(?:kucuk\s+){2,}kizlarim/g, "kucuk kizlarim")
    .replace(/(?:kucuk\s+){2,}kizlardan/g, "kucuk kizlardan")
    .replace(/(?:kucuk\s+){2,}kiz/g, "kucuk kiz")
    .replace(/(?:kucuk\s+){2,}oglusuma/g, "kucuk oglusuma")
    .replace(/(?:kucuk\s+){2,}oglusumu/g, "kucuk oglusumu")
    .replace(/(?:kucuk\s+){2,}oglusumun/g, "kucuk oglusumun")
    .replace(/(?:kucuk\s+){2,}oglusumda/g, "kucuk oglusumda")
    .replace(/(?:kucuk\s+){2,}oglusumla/g, "kucuk oglusumla")
    .replace(/(?:kucuk\s+){2,}oglusum/g, "kucuk oglusum")
    .replace(/(?:kucuk\s+){2,}ogluslarimdan/g, "kucuk ogluslarimdan")
    .replace(/(?:kucuk\s+){2,}ogluslarim/g, "kucuk ogluslarim")
    .replace(/(?:kucuk\s+){2,}ogluslardan/g, "kucuk ogluslardan")
    .replace(/(?:kucuk\s+){2,}oglus/g, "kucuk oglus");
}

function applyGender(text, gender) {
  let result = text;
  if (gender === "male" || gender === "littleMale") result = applyMaleWords(result);
  if (gender === "littleFemale") result = applyLittleFemaleWords(result);
  if (gender === "littleMale") result = applyLittleMaleWords(result);
  if (gender === "female") result = applyAdultFemaleWords(result);
  if (gender === "male") result = applyAdultMaleWords(result);
  return result;
}

function applyAdultFemaleWords(text) {
  return text
    .replace(/küçük kızıma/g, "kızıma")
    .replace(/Küçük kızıma/g, "Kızıma")
    .replace(/küçük kızımı/g, "kızımı")
    .replace(/Küçük kızımı/g, "Kızımı")
    .replace(/küçük kızımın/g, "kızımın")
    .replace(/Küçük kızımın/g, "Kızımın")
    .replace(/küçük kızımda/g, "kızımda")
    .replace(/Küçük kızımda/g, "Kızımda")
    .replace(/küçük kızımla/g, "kızımla")
    .replace(/Küçük kızımla/g, "Kızımla")
    .replace(/küçük kızım/g, "kızım")
    .replace(/Küçük kızım/g, "Kızım")
    .replace(/küçük kızlarımdan/g, "kızlarımdan")
    .replace(/Küçük kızlarımdan/g, "Kızlarımdan")
    .replace(/küçük kızlarım/g, "kızlarım")
    .replace(/Küçük kızlarım/g, "Kızlarım")
    .replace(/küçük kızlardan/g, "kızlardan")
    .replace(/Küçük kızlardan/g, "Kızlardan")
    .replace(/küçük kız/g, "kız")
    .replace(/Küçük kız/g, "Kız");
}

function applyAdultMaleWords(text) {
  return text
    .replace(/küçük oğluma/g, "oğluma")
    .replace(/Küçük oğluma/g, "Oğluma")
    .replace(/küçük oğlumu/g, "oğlumu")
    .replace(/Küçük oğlumu/g, "Oğlumu")
    .replace(/küçük oğlumun/g, "oğlumun")
    .replace(/Küçük oğlumun/g, "Oğlumun")
    .replace(/küçük oğlumda/g, "oğlumda")
    .replace(/Küçük oğlumda/g, "Oğlumda")
    .replace(/küçük oğlumla/g, "oğlumla")
    .replace(/Küçük oğlumla/g, "Oğlumla")
    .replace(/küçük oğlum/g, "oğlum")
    .replace(/Küçük oğlum/g, "Oğlum")
    .replace(/küçük oğlanlarımdan/g, "oğlanlarımdan")
    .replace(/Küçük oğlanlarımdan/g, "Oğlanlarımdan")
    .replace(/küçük oğlanlarım/g, "oğlanlarım")
    .replace(/Küçük oğlanlarım/g, "Oğlanlarım")
    .replace(/küçük oğlanlardan/g, "oğlanlardan")
    .replace(/Küçük oğlanlardan/g, "Oğlanlardan")
    .replace(/küçük oğlan/g, "oğlan")
    .replace(/Küçük oğlan/g, "Oğlan");
}

function applyMaleWords(text) {
  return text
    .replace(/good girl/g, "good boy")
    .replace(/Good girl/g, "Good boy")
    .replace(/goodgirl/g, "goodboy")
    .replace(/kızıma/g, "oğluma")
    .replace(/Kızıma/g, "Oğluma")
    .replace(/kızımı/g, "oğlumu")
    .replace(/Kızımı/g, "Oğlumu")
    .replace(/kızımın/g, "oğlumun")
    .replace(/Kızımın/g, "Oğlumun")
    .replace(/kızımda/g, "oğlumda")
    .replace(/Kızımda/g, "Oğlumda")
    .replace(/kızımla/g, "oğlumla")
    .replace(/Kızımla/g, "Oğlumla")
    .replace(/kızlardan/g, "oğlanlardan")
    .replace(/Kızlardan/g, "Oğlanlardan")
    .replace(/kızlarım/g, "oğlanlarım")
    .replace(/Kızlarım/g, "Oğlanlarım")
    .replace(/kızım/g, "oğlum")
    .replace(/Kızım/g, "Oğlum")
    .replace(/kız/g, "oğlan")
    .replace(/Kız/g, "Oğlan");
}

function applyLittleFemaleWords(text) {
  return text
    .replace(/küçük kız/g, "__KUCUK_KIZ__")
    .replace(/Küçük kız/g, "__BUYUK_KUCUK_KIZ__")
    .replace(/kızıma/g, "küçük kızıma")
    .replace(/Kızıma/g, "Küçük kızıma")
    .replace(/kızımı/g, "küçük kızımı")
    .replace(/Kızımı/g, "Küçük kızımı")
    .replace(/kızımın/g, "küçük kızımın")
    .replace(/Kızımın/g, "Küçük kızımın")
    .replace(/kızımda/g, "küçük kızımda")
    .replace(/Kızımda/g, "Küçük kızımda")
    .replace(/kızımla/g, "küçük kızımla")
    .replace(/Kızımla/g, "Küçük kızımla")
    .replace(/kızlarımdan/g, "küçük kızlarımdan")
    .replace(/Kızlarımdan/g, "Küçük kızlarımdan")
    .replace(/kızlarım/g, "küçük kızlarım")
    .replace(/Kızlarım/g, "Küçük kızlarım")
    .replace(/kızlardan/g, "küçük kızlardan")
    .replace(/Kızlardan/g, "Küçük kızlardan")
    .replace(/kızım/g, "küçük kızım")
    .replace(/Kızım/g, "Küçük kızım")
    .replace(/kız/g, "küçük kız")
    .replace(/Kız/g, "Küçük kız")
    .replace(/__KUCUK_KIZ__/g, "küçük kız")
    .replace(/__BUYUK_KUCUK_KIZ__/g, "Küçük kız");
}

function applyLittleMaleWords(text) {
  return text
    .replace(/küçük oğlan/g, "__KUCUK_OGLAN__")
    .replace(/Küçük oğlan/g, "__BUYUK_KUCUK_OGLAN__")
    .replace(/küçük oğl/g, "__KUCUK_OGL__")
    .replace(/Küçük oğl/g, "__BUYUK_KUCUK_OGL__")
    .replace(/oğluma/g, "küçük oğluşuma")
    .replace(/Oğluma/g, "Küçük oğluşuma")
    .replace(/oğlumu/g, "küçük oğluşumu")
    .replace(/Oğlumu/g, "Küçük oğluşumu")
    .replace(/oğlumun/g, "küçük oğluşumun")
    .replace(/Oğlumun/g, "Küçük oğluşumun")
    .replace(/oğlumda/g, "küçük oğluşumda")
    .replace(/Oğlumda/g, "Küçük oğluşumda")
    .replace(/oğlumla/g, "küçük oğluşumla")
    .replace(/Oğlumla/g, "Küçük oğluşumla")
    .replace(/oğlum/g, "küçük oğluşum")
    .replace(/Oğlum/g, "Küçük oğluşum")
    .replace(/oğlanlarımdan/g, "küçük oğluşlarımdan")
    .replace(/Oğlanlarımdan/g, "Küçük oğluşlarımdan")
    .replace(/oğlanlarım/g, "küçük oğluşlarım")
    .replace(/Oğlanlarım/g, "Küçük oğluşlarım")
    .replace(/oğlanlardan/g, "küçük oğluşlardan")
    .replace(/Oğlanlardan/g, "Küçük oğluşlardan")
    .replace(/oğlan/g, "küçük oğluş")
    .replace(/Oğlan/g, "Küçük oğluş")
    .replace(/__KUCUK_OGL__uma/g, "küçük oğluşuma")
    .replace(/__BUYUK_KUCUK_OGL__uma/g, "Küçük oğluşuma")
    .replace(/__KUCUK_OGL__umu/g, "küçük oğluşumu")
    .replace(/__BUYUK_KUCUK_OGL__umu/g, "Küçük oğluşumu")
    .replace(/__KUCUK_OGL__umun/g, "küçük oğluşumun")
    .replace(/__BUYUK_KUCUK_OGL__umun/g, "Küçük oğluşumun")
    .replace(/__KUCUK_OGL__umda/g, "küçük oğluşumda")
    .replace(/__BUYUK_KUCUK_OGL__umda/g, "Küçük oğluşumda")
    .replace(/__KUCUK_OGL__umla/g, "küçük oğluşumla")
    .replace(/__BUYUK_KUCUK_OGL__umla/g, "Küçük oğluşumla")
    .replace(/__KUCUK_OGL__um/g, "küçük oğluşum")
    .replace(/__BUYUK_KUCUK_OGL__um/g, "Küçük oğluşum")
    .replace(/__KUCUK_OGLAN__larımdan/g, "küçük oğluşlarımdan")
    .replace(/__BUYUK_KUCUK_OGLAN__larımdan/g, "Küçük oğluşlarımdan")
    .replace(/__KUCUK_OGLAN__larım/g, "küçük oğluşlarım")
    .replace(/__BUYUK_KUCUK_OGLAN__larım/g, "Küçük oğluşlarım")
    .replace(/__KUCUK_OGLAN__lardan/g, "küçük oğluşlardan")
    .replace(/__BUYUK_KUCUK_OGLAN__lardan/g, "Küçük oğluşlardan")
    .replace(/__KUCUK_OGLAN__/g, "küçük oğluş")
    .replace(/__BUYUK_KUCUK_OGLAN__/g, "Küçük oğluş");
}

function normalizeGender(gender) {
  return ["female", "littleFemale", "male", "littleMale"].includes(gender) ? gender : "female";
}

function makeSignature(text) {
  return cleanSpaces(toAsciiSafe(text).toLowerCase()).replace(/[^\w ]/g, "");
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}
