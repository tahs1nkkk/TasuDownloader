import { CATEGORY_DEFS } from "./comment-bank.js?v=8";
import { generateReview, utf8ByteLength } from "./generator.js?v=11";

const STORAGE_VERSION = 13;
const MAX_BYTES = 500;
const DECAL_IDS = {
  1: "79351186549697",
  2: "124035512143179",
  3: "117234944380041",
  4: "88085798148401",
  5: "131420802030548",
  6: "90176949251509",
  7: "122636799513043",
  8: "92727757507735",
  9: "94094433052534",
  10: "96341915563326"
};

const TONE_ORDER = ["classic", "contract", "strict", "freaky"];
const STYLE_ORDER = ["dada", "good", "robux", "freaky", "mean"];
const GENDER_ORDER = ["female", "littleFemale", "male", "littleMale"];
const LANGUAGE_ORDER = ["en", "tr"];

const TONES = {
  classic: { emoji: "🐾", en: "Dada tone", tr: "Dada tavrı" },
  contract: { emoji: "💸", en: "Robux tone", tr: "Robux tavrı" },
  strict: { emoji: "⚠", en: "Roast tone", tr: "Roast tavrı" },
  freaky: { emoji: "😈", en: "Freaky tone", tr: "Freaky tavır" }
};

const GENDERS = {
  female: { en: "Girl", tr: "Kız" },
  littleFemale: { en: "Little Girl", tr: "Küçük Kız" },
  male: { en: "Boy", tr: "Erkek" },
  littleMale: { en: "Little Boy", tr: "Küçük Oğluş" }
};

const STYLES = {
  dada: { en: "Mixed", tr: "Karışık" },
  good: { en: "Good", tr: "Good" },
  robux: { en: "Robux", tr: "Robux" },
  freaky: { en: "Freaky", tr: "Freaky" },
  mean: { en: "Roast", tr: "Roast" }
};

const I18N = {
  en: {
    turkishChars: "Turkish chars",
    extraEmoji: "Extra emoji",
    note: "Note",
    badge: "Badge",
    categories: "Categories",
    output: "Output",
    generate: "Generate",
    decal: "Decal ID",
    copy: "Copy",
    copied: "Copied",
    idCopied: "ID copied",
    score: "Score",
    random: "Random",
    categoriesMap: {
      kisilik: "Personality",
      avatar: "Avatar",
      uzme: "Not upsetting"
    }
  },
  tr: {
    turkishChars: "Türkçe",
    extraEmoji: "Ekstra emoji",
    note: "Not",
    badge: "Rozet",
    categories: "Kategoriler",
    output: "Çıktı",
    generate: "Generate",
    decal: "Decal ID",
    copy: "Kopyala",
    copied: "Kopyalandı",
    idCopied: "ID kopyalandı",
    score: "Puan",
    random: "Rastgele",
    categoriesMap: {
      kisilik: "Kişilik",
      avatar: "Avatar",
      uzme: "Üzmeme"
    }
  }
};

const DEFAULT_STATE = {
  version: STORAGE_VERSION,
  language: "en",
  tone: "classic",
  style: "dada",
  gender: "female",
  ascii: false,
  noEmoji: true,
  includeNote: false,
  includeBadge: false,
  ratings: Object.fromEntries(CATEGORY_DEFS.map((category) => [category.id, 3])),
  history: []
};

const els = {
  tone: document.querySelector("#toneBtn"),
  style: document.querySelector("#styleBtn"),
  gender: document.querySelector("#genderBtn"),
  language: document.querySelector("#langBtn"),
  ascii: document.querySelector("#asciiToggle"),
  noEmoji: document.querySelector("#emojiToggle"),
  note: document.querySelector("#noteToggle"),
  badge: document.querySelector("#badgeToggle"),
  rows: document.querySelector("#ratingRows"),
  avg: document.querySelector("#avgLabel"),
  generate: document.querySelector("#generateBtn"),
  decal: document.querySelector("#decalBtn"),
  copy: document.querySelector("#copyBtn"),
  output: document.querySelector("#outputText"),
  byteLabel: document.querySelector("#byteLabel"),
  meter: document.querySelector("#byteMeter")
};

let state = structuredClone(DEFAULT_STATE);

init();

async function init() {
  const savedState = await loadState();
  state = savedState.version === STORAGE_VERSION ? { ...DEFAULT_STATE, ...savedState } : structuredClone(DEFAULT_STATE);
  state.language = LANGUAGE_ORDER.includes(state.language) ? state.language : DEFAULT_STATE.language;
  state.ascii = false;
  state.gender = GENDER_ORDER.includes(state.gender) ? state.gender : DEFAULT_STATE.gender;
  state.tone = TONE_ORDER.includes(state.tone) ? state.tone : DEFAULT_STATE.tone;
  state.style = STYLE_ORDER.includes(state.style) ? state.style : DEFAULT_STATE.style;
  state.ratings = normalizeRatings(state.ratings);
  renderRows();
  syncInputs();
  bindEvents();
  applyLanguage(false);
  updateStats();
}

function renderRows() {
  els.rows.textContent = "";
  for (const category of CATEGORY_DEFS) {
    const row = document.createElement("div");
    row.className = "ratingRow";
    row.dataset.category = category.id;

    const name = document.createElement("div");
    name.className = "ratingName";
    name.dataset.categoryLabel = category.id;

    const random = document.createElement("button");
    random.type = "button";
    random.className = "randomBtn";
    random.dataset.randomCategory = category.id;
    random.textContent = "↯";

    const stars = document.createElement("div");
    stars.className = "stars";
    for (let value = 1; value <= 5; value += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.category = category.id;
      button.dataset.value = String(value);
      button.textContent = "★";
      stars.append(button);
    }

    row.append(name, random, stars);
    els.rows.append(row);
  }
  updateStars();
}

function bindEvents() {
  els.tone.addEventListener("click", () => cycleValue("tone", TONE_ORDER, els.tone));
  els.style.addEventListener("click", () => cycleValue("style", STYLE_ORDER, els.style));
  els.gender.addEventListener("click", () => cycleValue("gender", GENDER_ORDER, els.gender));
  els.language.addEventListener("click", () => {
    cycleValue("language", LANGUAGE_ORDER);
    applyLanguage(false);
  });
  els.ascii.addEventListener("change", () => updateState({ ascii: !els.ascii.checked }));
  els.noEmoji.addEventListener("change", () => updateState({ noEmoji: !els.noEmoji.checked }));
  els.note.addEventListener("change", () => updateState({ includeNote: els.note.checked }));
  els.badge.addEventListener("change", () => updateState({ includeBadge: els.badge.checked }));

  els.rows.addEventListener("click", (event) => {
    const random = event.target.closest("button[data-random-category]");
    if (random) {
      const category = random.dataset.randomCategory;
      state.ratings = { ...state.ratings, [category]: 1 + Math.floor(Math.random() * 5) };
      updateStars();
      updateAverage();
      saveState(state);
      return;
    }

    const button = event.target.closest("button[data-category]");
    if (!button) return;
    const category = button.dataset.category;
    const value = Number(button.dataset.value);
    state.ratings = { ...state.ratings, [category]: value };
    updateStars();
    updateAverage();
    saveState(state);
  });

  els.generate.addEventListener("click", generate);
  els.decal.addEventListener("click", copyDecalId);
  els.copy.addEventListener("click", copyOutput);
}

function cycleValue(key, values, animatedButton = null) {
  const index = values.indexOf(state[key]);
  state = { ...state, [key]: values[(index + 1) % values.length] };
  syncCycleButtons(animatedButton);
  updateAverage();
  saveState(state);
}

function syncInputs() {
  els.ascii.checked = state.ascii !== true;
  els.noEmoji.checked = state.noEmoji === false;
  els.note.checked = state.includeNote === true;
  els.badge.checked = state.includeBadge === true;
  syncCycleButtons(null);
  updateAverage();
}

function syncCycleButtons(animatedButton) {
  const lang = currentLang();
  setButtonText(els.tone, `${TONES[state.tone].emoji} ${TONES[state.tone][lang]}`, animatedButton === els.tone);
  setButtonText(els.style, STYLES[state.style][lang], animatedButton === els.style);
  setButtonText(els.gender, GENDERS[state.gender][lang], animatedButton === els.gender);
  els.language.title = lang === "en" ? "Türkçe" : "English";
  els.language.setAttribute("aria-label", els.language.title);
  els.gender.dataset.gender = genderBase(state.gender);
}

function setButtonText(button, text, animated) {
  button.classList.remove("slideUp");
  button.textContent = text;
  if (!animated) return;
  void button.offsetWidth;
  button.classList.add("slideUp");
  window.setTimeout(() => button.classList.remove("slideUp"), 450);
}

function applyLanguage(animated) {
  const lang = currentLang();
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = I18N[lang][node.dataset.i18n];
  });
  document.querySelectorAll("[data-category-label]").forEach((node) => {
    node.textContent = I18N[lang].categoriesMap[node.dataset.categoryLabel];
  });
  document.querySelectorAll("[data-random-category]").forEach((node) => {
    node.setAttribute("aria-label", `${I18N[lang].random} ${I18N[lang].categoriesMap[node.dataset.randomCategory]}`);
  });
  updateRatingLabels();
  syncCycleButtons(animated);
  updateAverage();
}

function updateState(patch) {
  state = { ...state, ...patch };
  updateStats();
  saveState(state);
}

function updateStars() {
  els.rows.querySelectorAll("button[data-category]").forEach((button) => {
    const value = Number(button.dataset.value);
    const selectedValue = Number(state.ratings[button.dataset.category]);
    button.classList.toggle("faded", value > selectedValue);
    button.classList.toggle("selected", value === selectedValue);
  });
  updateRatingLabels();
}

function updateRatingLabels() {
  const lang = currentLang();
  els.rows.querySelectorAll("button[data-category]").forEach((button) => {
    const category = I18N[lang].categoriesMap[button.dataset.category];
    button.setAttribute("aria-label", `${category} ${button.dataset.value}`);
  });
}

function updateAverage() {
  const score = getCurrentScore();
  els.avg.textContent = `${I18N[currentLang()].score}: ${score}/10`;
}

function generate() {
  state.ascii = !els.ascii.checked;
  state.noEmoji = !els.noEmoji.checked;
  state.includeNote = els.note.checked;
  state.includeBadge = els.badge.checked;

  const result = generateReview({ ...state, maxBytes: MAX_BYTES });
  els.output.value = result.text;
  state.history = [result.signature, ...(state.history || []).filter((item) => item !== result.signature)].slice(0, 200);
  updateStats();
  saveState(state);
}

async function copyOutput() {
  const text = els.output.value;
  if (!text) return;
  await copyText(text, els.copy, I18N[currentLang()].copied);
}

async function copyDecalId() {
  const score = getCurrentScore();
  await copyText(DECAL_IDS[score] || "", els.decal, I18N[currentLang()].idCopied);
}

async function copyText(text, button, message) {
  if (!text) return;
  if (button) button.dataset.lastCopy = text;

  try {
    await navigator.clipboard.writeText(text);
    legacyCopy(text);
    flashButton(button, message);
  } catch {
    legacyCopy(text);
    flashButton(button, message);
  }
}

function legacyCopy(text) {
  const fallbackInput = document.createElement("textarea");
  fallbackInput.value = text;
  fallbackInput.style.position = "fixed";
  fallbackInput.style.opacity = "0";
  document.body.append(fallbackInput);
  fallbackInput.select();
  document.execCommand("copy");
  fallbackInput.remove();
}

function flashButton(button, message) {
  if (!button) return;
  const original = button.textContent;
  button.textContent = message;
  window.setTimeout(() => {
    button.textContent = original;
  }, 900);
}

function updateStats() {
  const max = MAX_BYTES;
  const text = els.output.value || "";
  const bytes = utf8ByteLength(text);
  const pct = max ? Math.min(100, Math.round((bytes / max) * 100)) : 0;
  els.byteLabel.textContent = `${bytes} / ${max} byte`;
  els.meter.style.width = `${pct}%`;
  els.meter.classList.toggle("warn", pct >= 85 && pct < 100);
  els.meter.classList.toggle("danger", pct >= 100);
}

function resetState() {
  state = structuredClone(DEFAULT_STATE);
  els.output.value = "";
  syncInputs();
  applyLanguage(false);
  updateStars();
  updateStats();
  saveState(state);
}

function normalizeRatings(ratings) {
  const source = ratings || {};
  return Object.fromEntries(CATEGORY_DEFS.map((category) => {
    const value = Number(source[category.id] ?? DEFAULT_STATE.ratings[category.id]);
    return [category.id, Math.min(5, Math.max(1, Number.isFinite(value) ? Math.round(value) : 3))];
  }));
}

function getCurrentScore() {
  const total = CATEGORY_DEFS.reduce((sum, category) => sum + effectiveRating(category.id, state.ratings[category.id]), 0);
  const avg = total / CATEGORY_DEFS.length;
  return Math.min(10, Math.max(1, Math.round(avg * 2)));
}

function effectiveRating(categoryId, value) {
  const rating = Math.min(5, Math.max(1, Math.round(Number(value) || 3)));
  return rating;
}

function currentLang() {
  return LANGUAGE_ORDER.includes(state.language) ? state.language : "en";
}

function genderBase(gender) {
  return gender === "male" || gender === "littleMale" ? "male" : "female";
}

async function loadState() {
  if (globalThis.chrome?.storage?.local) {
    const result = await chrome.storage.local.get("reviewGeneratorState");
    return result.reviewGeneratorState || {};
  }
  try {
    return JSON.parse(localStorage.getItem("reviewGeneratorState") || "{}");
  } catch {
    return {};
  }
}

function saveState(nextState) {
  const serializable = {
    version: STORAGE_VERSION,
    language: nextState.language,
    tone: nextState.tone,
    style: nextState.style,
    gender: nextState.gender,
    ascii: nextState.ascii,
    noEmoji: nextState.noEmoji,
    includeNote: nextState.includeNote,
    includeBadge: nextState.includeBadge,
    ratings: nextState.ratings,
    history: nextState.history
  };

  if (globalThis.chrome?.storage?.local) {
    chrome.storage.local.set({ reviewGeneratorState: serializable });
    return;
  }
  localStorage.setItem("reviewGeneratorState", JSON.stringify(serializable));
}
