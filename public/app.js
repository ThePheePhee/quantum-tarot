const drawButton = document.querySelector("#drawButton");
const drawCountInput = document.querySelector("#drawCount");
const deckCountInput = document.querySelector("#deckCount");
const replacementToggle = document.querySelector("#replacementToggle");
const statusText = document.querySelector("#statusText");
const spread = document.querySelector("#spread");
const receiptState = document.querySelector("#receiptState");
const receiptSource = document.querySelector("#receiptSource");
const receiptTime = document.querySelector("#receiptTime");
const receiptEntropy = document.querySelector("#receiptEntropy");
const receiptSeed = document.querySelector("#receiptSeed");
const receiptLocalSum = document.querySelector("#receiptLocalSum");
const receiptTiming = document.querySelector("#receiptTiming");
const sigilPath = document.querySelector("#sigilPath");
const phraseInput = document.querySelector("#phraseInput");
const localSeedButton = document.querySelector("#localSeedButton");
const clearSeedButton = document.querySelector("#clearSeedButton");
const localStatus = document.querySelector("#localStatus");
const drawTab = document.querySelector("#drawTab");
const dashboardTab = document.querySelector("#dashboardTab");
const drawView = document.querySelector("#drawView");
const dashboardView = document.querySelector("#dashboardView");
const dashboardStatus = document.querySelector("#dashboardStatus");
const dashboardVisuals = document.querySelector("#dashboardVisuals");
const correspondenceList = document.querySelector("#correspondenceList");
const refreshDashboardButton = document.querySelector("#refreshDashboardButton");
const visualDashboardTab = document.querySelector("#visualDashboardTab");
const listDashboardTab = document.querySelector("#listDashboardTab");
const visualDashboardView = document.querySelector("#visualDashboardView");
const listDashboardView = document.querySelector("#listDashboardView");

const timingMs = [];
let seeded = false;
let previousPhraseLength = 0;

await refreshStatus();

drawButton.addEventListener("click", async () => {
  setBusy(drawButton, true);
  await requestDraw();
  setBusy(drawButton, false);
});

phraseInput.addEventListener("keydown", (event) => {
  if (event.key.length === 1) {
    timingMs.push(Math.trunc(event.timeStamp));
  }
});

phraseInput.addEventListener("input", () => {
  const lengthDelta = Math.max(0, phraseInput.value.length - previousPhraseLength);
  const missingTimings = Math.max(0, phraseInput.value.length - timingMs.length);

  for (let index = 0; index < Math.min(lengthDelta, missingTimings); index += 1) {
    timingMs.push(Math.trunc(performance.now()));
  }

  previousPhraseLength = phraseInput.value.length;

  if (phraseInput.value.length === 0) {
    timingMs.length = 0;
    previousPhraseLength = 0;
  }

  updateLocalControls();
});

localSeedButton.addEventListener("click", async () => {
  await requestLocalSeed("/api/reseed-local", localSeedButton, "Local timing seed received.");
});

clearSeedButton.addEventListener("click", requestClearSeed);

drawTab.addEventListener("click", () => {
  setActiveView("draw");
});

dashboardTab.addEventListener("click", async () => {
  setActiveView("dashboard");
  await loadDashboard();
});

refreshDashboardButton.addEventListener("click", loadDashboard);
visualDashboardTab.addEventListener("click", () => setActiveDashboardSubview("visual"));
listDashboardTab.addEventListener("click", () => setActiveDashboardSubview("list"));

async function refreshStatus() {
  const response = await fetch("/api/status");
  const status = await response.json();

  seeded = status.seeded;
  statusText.textContent = status.seeded
    ? "Full RNG seed is ready."
    : "Awaiting local entropy seed.";

  renderReceipt(status.latestReceipt);
  syncDrawControls();
}

async function requestDraw() {
  try {
    const settings = normalizeDrawSettings();
    const result = await postJson("/api/draw", settings);
    renderSpread(result.cards);
    statusText.textContent = "Spread drawn from the current full RNG seed.";
    await loadDashboard();
  } catch (error) {
    statusText.textContent = error.message;
  }
}

async function requestLocalSeed(path, button, successMessage) {
  const payload = localSeedPayload();

  if (!payload) {
    localStatus.textContent = "Type a phrase with at least 10 letters first.";
    return;
  }

  setBusy(button, true);
  statusText.textContent = "Seeding from local keystroke timing...";

  try {
    const result = await postJson(path, payload);
    seeded = true;
    statusText.textContent = successMessage;
    renderReceipt(result);
  } catch (error) {
    statusText.textContent = error.message;
  } finally {
    setBusy(button, false);
    updateLocalControls();
    syncDrawControls();
  }
}

async function requestClearSeed() {
  setBusy(clearSeedButton, true);
  statusText.textContent = "Clearing local seed...";

  try {
    await postJson("/api/clear-seed");
    seeded = false;
    renderReceipt(null);
    renderInitialSpread();
    dashboardStatus.textContent = "Draw cards to load correspondences.";
    correspondenceList.replaceChildren();
    renderDashboardVisuals(createActivationModel([]));
    statusText.textContent = "Local seed cleared.";
  } catch (error) {
    statusText.textContent = error.message;
  } finally {
    setBusy(clearSeedButton, false);
    syncDrawControls();
  }
}

function renderSpread(cards) {
  spread.style.setProperty("--card-count", String(cards.length));
  spread.replaceChildren(
    ...cards.map((card, index) => {
      const article = document.createElement("article");
      article.className = "card-slot revealed";

      const image = document.createElement("img");
      image.src = card.imageUrl;
      image.alt = card.name;
      image.loading = "eager";

      const detail = document.createElement("div");
      detail.className = "card-detail";

      const position = document.createElement("p");
      position.className = "position";
      position.textContent = card.position ?? `Card ${index + 1}`;

      const name = document.createElement("h2");
      name.textContent = card.name;

      const number = document.createElement("p");
      number.className = "number";
      number.textContent = `No. ${card.number}`;

      detail.append(position, name, number);
      article.append(image, detail);

      return article;
    })
  );
  drawButton.textContent = `Draw ${cards.length} ${cards.length === 1 ? "card" : "cards"}`;
}

function renderInitialSpread() {
  spread.style.removeProperty("--card-count");
  spread.innerHTML = `
    <article class="card-slot">
      <div class="card-back"><span>Past</span></div>
    </article>
    <article class="card-slot">
      <div class="card-back"><span>Present</span></div>
    </article>
    <article class="card-slot">
      <div class="card-back"><span>Future</span></div>
    </article>
  `;
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

function setBusy(button, isBusy) {
  button.disabled = button === drawButton ? isBusy || !seeded : isBusy;
  button.setAttribute("aria-busy", String(isBusy));
}

function updateLocalControls() {
  const letterCount = countLetters(phraseInput.value);
  const ready = letterCount >= 10 && timingMs.length >= 10;
  localSeedButton.disabled = !ready;
  localStatus.textContent = `${letterCount} letters captured. ${timingMs.length} keystroke timings recorded.`;
}

function localSeedPayload() {
  const letterCount = countLetters(phraseInput.value);

  if (letterCount < 10 || timingMs.length < 10) {
    return null;
  }

  const timings = [...timingMs];
  const timingSum = timings.reduce((sum, value) => sum + value, 0);

  return {
    letterCount,
    timingMs: timings,
    timingSum
  };
}

function countLetters(value) {
  return value.replace(/[^a-z]/gi, "").length;
}

function renderReceipt(receipt) {
  if (!receipt) {
    receiptState.textContent = "Not received yet";
    receiptSource.textContent = "--";
    receiptTime.textContent = "--";
    receiptEntropy.textContent = "--";
    receiptSeed.textContent = "--";
    receiptLocalSum.textContent = "--";
    receiptTiming.textContent = "--";
    renderEntropySigil(null);
    return;
  }

  receiptState.textContent = `${titleCase(receipt.mode)} full RNG seed received`;
  receiptSource.textContent = receipt.source;
  receiptTime.textContent = new Date(receipt.receivedAt).toLocaleString();
  receiptEntropy.textContent = `${receipt.entropyBytesUsed} bytes`;
  receiptSeed.textContent = formatSeedHex(receipt.seedHex);
  receiptLocalSum.textContent = receipt.localTimingSum ? String(receipt.localTimingSum) : "--";
  receiptTiming.textContent = receipt.localTimingMs?.length ? receipt.localTimingMs.join(" + ") : "--";
  renderEntropySigil(receipt.seedHex);
}

function formatSeedHex(seedHex) {
  return seedHex.match(/.{1,2}/g)?.join(" ") ?? seedHex;
}

function titleCase(value) {
  return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : "Random";
}

function renderEntropySigil(seedHex) {
  if (!sigilPath) return;

  const points = seededSigilPoints(seedHex);
  const pathOrder = [1, 3, 6, 4, 2, 5, 1];
  const path = pathOrder.map((label, index) => {
    const point = points.get(label);
    return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).join(" ");

  sigilPath.setAttribute("d", `${path} Z`);
}

function seededSigilPoints(seedHex) {
  const labels = [1, 2, 3, 4, 5, 6];
  const output = new Map();

  if (!seedHex) {
    const basePoints = circlePoints(6, 100, 100, 84);
    labels.forEach((label, index) => {
      output.set(label, basePoints[index]);
    });
    return output;
  }

  const random = seededUnitRandom(seedHex);

  labels.forEach((label, index) => {
    output.set(label, pointOnCircle(random(), 100, 100, 84));
  });

  return output;
}

function circlePoints(count, cx, cy, radius) {
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / count);
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    };
  });
}

function pointOnCircle(ratio, cx, cy, radius) {
  const angle = -Math.PI / 2 + ratio * Math.PI * 2;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius
  };
}

function seededUnitRandom(seedText) {
  const bytes = seedText.match(/.{1,2}/g)?.map((value) => Number.parseInt(value, 16)) ?? [];
  let state = 2166136261;

  for (const byte of bytes.length ? bytes : Array.from(seedText, (character) => character.charCodeAt(0))) {
    state ^= byte;
    state = Math.imul(state, 16777619) >>> 0;
  }

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function setActiveView(view) {
  const dashboardActive = view === "dashboard";
  drawTab.classList.toggle("active", !dashboardActive);
  dashboardTab.classList.toggle("active", dashboardActive);
  drawView.classList.toggle("active", !dashboardActive);
  dashboardView.classList.toggle("active", dashboardActive);
}

async function loadDashboard() {
  dashboardStatus.textContent = "Loading ontology correspondences...";

  try {
    const dashboard = await fetchJson("/api/dashboard");

    if (!dashboard.draw.length) {
      dashboardStatus.textContent = "Draw cards to load correspondences.";
      correspondenceList.replaceChildren();
      return;
    }

    dashboardStatus.textContent = dashboard.connected
      ? `${dashboard.correspondences.length} correspondences loaded from Baserow.`
      : dashboard.error ?? "Ontology database is not connected.";
    renderCorrespondences(dashboard.correspondences);
  } catch (error) {
    dashboardStatus.textContent = error.message;
  }
}

async function fetchJson(path) {
  const response = await fetch(path);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

function renderCorrespondences(correspondences) {
  renderDashboardVisuals(createActivationModel(correspondences));

  if (!correspondences.length) {
    correspondenceList.replaceChildren(emptyMessage("No correspondences found for this draw."));
    return;
  }

  correspondenceList.replaceChildren(
    ...Array.from(groupByCard(correspondences).entries()).map(([cardName, cardCorrespondences]) => {
      const section = document.createElement("section");
      section.className = "card-correspondence-group";

      const heading = document.createElement("h3");
      heading.textContent = cardName;

      const items = document.createElement("div");
      items.className = "card-correspondence-items";
      items.replaceChildren(...cardCorrespondences.map(renderCorrespondenceItem));

      section.append(heading, items);
      return section;
    })
  );
}

function renderCorrespondenceItem(correspondence) {
  const article = document.createElement("article");
  article.className = "correspondence-item";

  const meta = document.createElement("p");
  meta.className = "correspondence-meta";
  meta.textContent = `${correspondence.type}${correspondence.layer ? ` - ${correspondence.layer}` : ""}`;

  const title = document.createElement("h4");
  title.textContent = correspondence.displayName;

  const value = document.createElement("p");
  value.className = "correspondence-value";
  value.textContent = correspondence.value || correspondence.description || "No value recorded.";

  const detail = document.createElement("p");
  detail.className = "correspondence-detail";
  detail.textContent = [
    correspondence.system,
    correspondence.certainty,
    correspondence.reviewStatus,
    correspondence.sourceReference
  ].filter(Boolean).join(" - ");

  article.append(meta, title, value, detail);
  return article;
}

function groupByCard(correspondences) {
  const output = new Map();
  for (const correspondence of correspondences) {
    const cardLabel = `Card ${(correspondence.drawIndex ?? 0) + 1}: ${correspondence.cardName}`;
    const group = output.get(cardLabel) ?? [];
    group.push(correspondence);
    output.set(cardLabel, group);
  }
  return output;
}

function emptyMessage(message) {
  const element = document.createElement("p");
  element.className = "empty";
  element.textContent = message;
  return element;
}

function normalizeDrawCount() {
  return normalizeDrawSettings().count;
}

drawCountInput.addEventListener("input", syncDrawControls);
deckCountInput.addEventListener("input", syncDrawControls);
replacementToggle.addEventListener("change", syncDrawControls);

function normalizeDrawSettings() {
  const replacement = replacementToggle.checked;
  const decks = parsePositiveInteger(deckCountInput.value);
  const requestedCount = parsePositiveInteger(drawCountInput.value);

  if (!decks || decks > 20) {
    throw new Error("Deck count must be an integer between 1 and 20.");
  }

  if (!requestedCount) {
    throw new Error("Draw count must be a positive integer.");
  }

  const max = replacement ? Number.POSITIVE_INFINITY : decks * 78;

  if (requestedCount > max) {
    throw new Error(`With ${decks} deck${decks === 1 ? "" : "s"} without replacement, the maximum draw is ${max} cards.`);
  }

  return { replacement, decks, count: requestedCount };
}

function syncDrawControls() {
  const decks = parsePositiveInteger(deckCountInput.value);
  const count = parsePositiveInteger(drawCountInput.value);
  const replacement = replacementToggle.checked;
  const max = replacement || !decks ? Number.POSITIVE_INFINITY : decks * 78;
  const valid = Boolean(decks && decks <= 20 && count && count <= max);

  drawButton.disabled = !seeded || !valid;
  clearSeedButton.disabled = !seeded;
  drawButton.title = valid ? "" : drawControlMessage(decks, count, max, replacement);
  drawButton.textContent = count
    ? `Draw ${count} ${count === 1 ? "card" : "cards"}`
    : "Draw cards";
}

function parsePositiveInteger(value) {
  const trimmed = String(value).trim();

  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return null;
  }

  const numberValue = Number(trimmed);

  if (!Number.isSafeInteger(numberValue) || numberValue < 1) {
    return null;
  }

  return numberValue;
}

function drawControlMessage(decks, count, max, replacement) {
  if (!decks) return "Enter a deck count.";
  if (decks > 20) return "Use 20 decks or fewer.";
  if (!count) return "Enter a card count.";
  if (!replacement && count > max) return `Maximum is ${max} cards without replacement.`;
  return "";
}

function createActivationModel(correspondences) {
  const counts = new Map();
  const seenPerCard = new Map();

  for (const correspondence of correspondences) {
    const cardKey = `${correspondence.drawIndex ?? 0}:${correspondence.cardName}:${correspondence.ontologyCardId ?? ""}`;
    const seen = seenPerCard.get(cardKey) ?? new Set();

    for (const key of activationKeys(correspondence)) {
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    seenPerCard.set(cardKey, seen);
  }

  const uniqueCounts = Array.from(new Set(counts.values())).sort((left, right) => left - right);
  const max = uniqueCounts.at(-1) ?? 0;
  const heatScale = uniqueCounts.map((count, index) => ({
    count,
    color: discreteHeatColor(index, uniqueCounts.length)
  }));
  const heatByCount = new Map(heatScale.map((item) => [item.count, item.color]));

  return {
    count(key) {
      return counts.get(key) ?? 0;
    },
    heatScale,
    max,
    strength(key) {
      return ((counts.get(key) ?? 0) / Math.max(1, max)).toFixed(2);
    },
    heat(key) {
      const count = counts.get(key) ?? 0;
      return count ? heatByCount.get(count) : "rgba(202, 164, 90, 0.22)";
    }
  };
}

function discreteHeatColor(index, total) {
  const ratio = total <= 1 ? 1 : index / (total - 1);
  const hue = 205 - ratio * 205;
  const lightness = 60 - ratio * 8;
  return `hsl(${hue.toFixed(0)} 92% ${lightness.toFixed(0)}%)`;
}

function heatLegend(heatScale) {
  const steps = heatScale.map(({ count, color }) => ({
    color,
    label: `${count} ${count === 1 ? "activation" : "activations"}`
  }));

  return `<article class="heatmap-legend"><h3>Activation Heat</h3><div class="legend-scale">
    ${steps.length
      ? steps.map((step) => `<div><span style="--heat:${step.color}"></span><small>${step.label}</small></div>`).join("")
      : "<p>No activations yet</p>"}
  </div></article>`;
}

function activationKeys(correspondence) {
  const text = [
    correspondence.type,
    correspondence.displayName,
    correspondence.value,
    correspondence.description
  ].join(" ").toLowerCase();
  const keys = [];

  for (const element of ["spirit", "fire", "water", "air", "earth"]) {
    if (containsWord(text, element)) keys.push(`element:${element}`);
  }

  for (const planet of ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]) {
    if (containsWord(text, planet)) keys.push(`planet:${planet}`);
  }

  for (const sign of zodiacSigns.map((item) => item.key)) {
    if (containsWord(text, sign.replace("-", " "))) keys.push(`zodiac:${sign}`);
  }

  const pathMatch = text.match(/path\s+([1-3][0-9]|[1-9])/);
  if (pathMatch) keys.push(`path:${pathMatch[1]}`);

  if (text.includes("hebrew")) {
    for (const letter of hebrewLetters) {
      if (containsWord(text, letter.key) || text.includes(letter.glyph)) {
        keys.push(`hebrew:${letter.key}`);
      }
    }
  }

  for (const sephirah of sephiroth.map((item) => item.key)) {
    if (containsWord(text, sephirah)) keys.push(`sephirah:${sephirah}`);
  }

  return keys;
}

function containsWord(text, word) {
  return new RegExp(`(^|[^a-z])${word}([^a-z]|$)`).test(text);
}

const sephiroth = [
  { key: "kether", label: "Kether", x: 150, y: 28 },
  { key: "chokmah", label: "Chokmah", x: 230, y: 82 },
  { key: "binah", label: "Binah", x: 70, y: 82 },
  { key: "chesed", label: "Chesed", x: 230, y: 155 },
  { key: "geburah", label: "Geburah", x: 70, y: 155 },
  { key: "tiphareth", label: "Tiphareth", x: 150, y: 205 },
  { key: "netzach", label: "Netzach", x: 230, y: 270 },
  { key: "hod", label: "Hod", x: 70, y: 270 },
  { key: "yesod", label: "Yesod", x: 150, y: 328 },
  { key: "malkuth", label: "Malkuth", x: 150, y: 388 }
];

const treePaths = [
  ["11", 150, 28, 230, 82], ["12", 150, 28, 70, 82], ["13", 150, 28, 150, 205],
  ["14", 230, 82, 70, 82], ["15", 230, 82, 150, 205], ["16", 70, 82, 150, 205],
  ["17", 230, 82, 230, 155], ["18", 70, 82, 70, 155], ["19", 70, 155, 230, 155],
  ["20", 230, 155, 150, 205], ["21", 70, 155, 150, 205], ["22", 230, 155, 230, 270],
  ["23", 70, 155, 70, 270], ["24", 150, 205, 230, 270], ["25", 150, 205, 70, 270],
  ["26", 150, 205, 150, 328], ["27", 70, 270, 230, 270], ["28", 230, 270, 150, 328],
  ["29", 230, 270, 150, 388], ["30", 70, 270, 150, 328], ["31", 70, 270, 150, 388],
  ["32", 150, 328, 150, 388]
];

const zodiacSigns = [
  { key: "aries", label: "Aries", glyph: "♈" },
  { key: "taurus", label: "Taurus", glyph: "♉" },
  { key: "gemini", label: "Gemini", glyph: "♊" },
  { key: "cancer", label: "Cancer", glyph: "♋" },
  { key: "leo", label: "Leo", glyph: "♌" },
  { key: "virgo", label: "Virgo", glyph: "♍" },
  { key: "libra", label: "Libra", glyph: "♎" },
  { key: "scorpio", label: "Scorpio", glyph: "♏" },
  { key: "sagittarius", label: "Sagittarius", glyph: "♐" },
  { key: "capricorn", label: "Capricorn", glyph: "♑" },
  { key: "aquarius", label: "Aquarius", glyph: "♒" },
  { key: "pisces", label: "Pisces", glyph: "♓" }
];

const hebrewLetters = [
  { key: "aleph", glyph: "א" }, { key: "beth", glyph: "ב" }, { key: "gimel", glyph: "ג" },
  { key: "daleth", glyph: "ד" }, { key: "heh", glyph: "ה" }, { key: "vav", glyph: "ו" },
  { key: "zayin", glyph: "ז" }, { key: "cheth", glyph: "ח" }, { key: "teth", glyph: "ט" },
  { key: "yod", glyph: "י" }, { key: "kaph", glyph: "כ" }, { key: "lamed", glyph: "ל" },
  { key: "mem", glyph: "מ" }, { key: "nun", glyph: "נ" }, { key: "samekh", glyph: "ס" },
  { key: "ayin", glyph: "ע" }, { key: "peh", glyph: "פ" }, { key: "tzaddi", glyph: "צ" },
  { key: "qoph", glyph: "ק" }, { key: "resh", glyph: "ר" }, { key: "shin", glyph: "ש" },
  { key: "tav", glyph: "ת" }
];

const planets = [
  { key: "saturn", entity: "&#9796;" },
  { key: "jupiter", entity: "&#9795;" },
  { key: "mars", entity: "&#9794;" },
  { key: "sun", entity: "&#9737;" },
  { key: "venus", entity: "&#9792;" },
  { key: "mercury", entity: "&#9791;" },
  { key: "moon", entity: "&#9789;" }
];

const pentagramPoints = [
  { key: "spirit", label: "Spirit", x: 150, y: 25 },
  { key: "water", label: "Water", x: 30, y: 118 },
  { key: "fire", label: "Fire", x: 270, y: 118 },
  { key: "earth", label: "Earth", x: 75, y: 262 },
  { key: "air", label: "Air", x: 225, y: 262 }
];

function renderDashboardVisuals(activation) {
  dashboardVisuals.innerHTML = `
    <section class="dashboard-overview">
      ${heatLegend(activation.heatScale)}
    </section>
    <section class="diagram-grid">
      ${treeOfLifeSvg(activation)}
      ${zodiacSvg(activation)}
      ${planetaryFrame(activation)}
      ${elementPentagramSvg(activation)}
      ${hebrewLetterFrame(activation)}
    </section>
  `;
}

function activeAttrs(activation, key) {
  const count = activation.count(key);
  const strength = activation.strength(key);
  const heat = activation.heat(key);
  return `data-count="${count}" style="--strength:${strength};--heat:${heat}" class="${count ? "active" : ""}" data-label="${count ? count : ""}"`;
}

function treeOfLifeSvg(activation) {
  return `<article class="diagram-panel tree-panel"><h3>Tree of Life</h3><svg viewBox="0 0 300 420" role="img" aria-label="Tree of Life correspondences">
    ${treePaths.map(([id, x1, y1, x2, y2]) => `<line ${activeAttrs(activation, `path:${id}`)} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`).join("")}
    ${sephiroth.map((item) => `<g ${activeAttrs(activation, `sephirah:${item.key}`)}><circle cx="${item.x}" cy="${item.y}" r="18"></circle><text x="${item.x}" y="${item.y + 4}">${item.label}</text></g>`).join("")}
  </svg></article>`;
}

function zodiacSvg(activation) {
  return `<article class="diagram-panel zodiac-panel"><h3>Zodiac</h3><svg viewBox="0 0 300 300" role="img" aria-label="Zodiac correspondences">
    <circle class="diagram-ring" cx="150" cy="150" r="106"></circle>
    ${zodiacSigns.map((sign, index) => {
      const angle = (index / zodiacSigns.length) * Math.PI * 2 - Math.PI / 2;
      const x = 150 + Math.cos(angle) * 104;
      const y = 150 + Math.sin(angle) * 104;
      return `<g ${activeAttrs(activation, `zodiac:${sign.key}`)}><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="21"></circle><text class="zodiac-glyph" x="${x.toFixed(1)}" y="${(y - 2).toFixed(1)}">${sign.glyph}</text><text x="${x.toFixed(1)}" y="${(y + 13).toFixed(1)}">${sign.label.slice(0, 3)}</text></g>`;
    }).join("")}
  </svg></article>`;
}

function planetaryFrame(activation) {
  return `<article class="diagram-panel planet-panel"><h3>Planets</h3><div class="planet-frame">
    ${planets.map((planet) => `<div ${activeAttrs(activation, `planet:${planet.key}`)}><span>${planet.entity}</span><small>${titleCase(planet.key)}</small></div>`).join("")}
  </div></article>`;
}

function elementPentagramSvg(activation) {
  return `<article class="diagram-panel element-panel"><h3>Elements</h3><svg viewBox="0 0 300 300" role="img" aria-label="Elemental pentagram correspondences">
    <path class="pentagram-line" d="M150 25 L75 262 L270 118 L30 118 L225 262 Z"></path>
    ${pentagramPoints.map((point) => `<g ${activeAttrs(activation, `element:${point.key}`)}><circle cx="${point.x}" cy="${point.y}" r="23"></circle><text x="${point.x}" y="${point.y + 4}">${point.label}</text></g>`).join("")}
  </svg></article>`;
}

function hebrewLetterFrame(activation) {
  return `<article class="diagram-panel hebrew-panel"><h3>Hebrew Letters</h3><div class="hebrew-grid">
    ${hebrewLetters.map((letter) => `<div ${activeAttrs(activation, `hebrew:${letter.key}`)}><span>${letter.glyph}</span><small>${titleCase(letter.key)}</small></div>`).join("")}
  </div></article>`;
}

function setActiveDashboardSubview(view) {
  const listActive = view === "list";
  visualDashboardTab.classList.toggle("active", !listActive);
  listDashboardTab.classList.toggle("active", listActive);
  visualDashboardView.classList.toggle("active", !listActive);
  listDashboardView.classList.toggle("active", listActive);
}

renderDashboardVisuals(createActivationModel([]));
syncDrawControls();
