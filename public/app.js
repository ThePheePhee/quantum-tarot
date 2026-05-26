const drawButton = document.querySelector("#drawButton");
const statusText = document.querySelector("#statusText");
const spread = document.querySelector("#spread");
const receiptState = document.querySelector("#receiptState");
const receiptSource = document.querySelector("#receiptSource");
const receiptTime = document.querySelector("#receiptTime");
const receiptEntropy = document.querySelector("#receiptEntropy");
const receiptSeed = document.querySelector("#receiptSeed");
const receiptLocalSum = document.querySelector("#receiptLocalSum");
const receiptTiming = document.querySelector("#receiptTiming");
const phraseInput = document.querySelector("#phraseInput");
const localSeedButton = document.querySelector("#localSeedButton");
const localStatus = document.querySelector("#localStatus");
const drawTab = document.querySelector("#drawTab");
const dashboardTab = document.querySelector("#dashboardTab");
const drawView = document.querySelector("#drawView");
const dashboardView = document.querySelector("#dashboardView");
const dashboardStatus = document.querySelector("#dashboardStatus");
const correspondenceList = document.querySelector("#correspondenceList");
const refreshDashboardButton = document.querySelector("#refreshDashboardButton");

const positions = ["Past", "Present", "Future"];
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

drawTab.addEventListener("click", () => {
  setActiveView("draw");
});

dashboardTab.addEventListener("click", async () => {
  setActiveView("dashboard");
  await loadDashboard();
});

refreshDashboardButton.addEventListener("click", loadDashboard);

async function refreshStatus() {
  const response = await fetch("/api/status");
  const status = await response.json();

  seeded = status.seeded;
  drawButton.disabled = !seeded;
  statusText.textContent = status.seeded
    ? `Seed ${status.seedVersion} is ready.`
    : "Awaiting local entropy seed.";

  renderReceipt(status.latestReceipt);
}

async function requestDraw() {
  try {
    const result = await postJson("/api/draw");
    renderSpread(result.cards);
    statusText.textContent = `Spread drawn from seed ${result.seedVersion}.`;
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
    drawButton.disabled = false;
    statusText.textContent = successMessage;
    renderReceipt(result);
  } catch (error) {
    statusText.textContent = error.message;
  } finally {
    setBusy(button, false);
    updateLocalControls();
  }
}

function renderSpread(cards) {
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
      position.textContent = positions[index];

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
    return;
  }

  receiptState.textContent = `${titleCase(receipt.mode)} seed ${receipt.seedVersion} received`;
  receiptSource.textContent = receipt.source;
  receiptTime.textContent = new Date(receipt.receivedAt).toLocaleString();
  receiptEntropy.textContent = `${receipt.entropyBytesUsed} bytes`;
  receiptSeed.textContent = formatSeedHex(receipt.seedHex);
  receiptLocalSum.textContent = receipt.localTimingSum ? String(receipt.localTimingSum) : "--";
  receiptTiming.textContent = receipt.localTimingMs?.length ? receipt.localTimingMs.join(" + ") : "--";
}

function formatSeedHex(seedHex) {
  return seedHex.match(/.{1,2}/g)?.join(" ") ?? seedHex;
}

function titleCase(value) {
  return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : "Random";
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
  if (!correspondences.length) {
    correspondenceList.replaceChildren(emptyMessage("No correspondences found for this draw."));
    return;
  }

  correspondenceList.replaceChildren(
    ...correspondences.map((correspondence) => {
      const article = document.createElement("article");
      article.className = "correspondence-item";

      const meta = document.createElement("p");
      meta.className = "correspondence-meta";
      meta.textContent = `${correspondence.cardName} · ${correspondence.type}${correspondence.layer ? ` · ${correspondence.layer}` : ""}`;

      const title = document.createElement("h3");
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
      ].filter(Boolean).join(" · ");

      article.append(meta, title, value, detail);
      return article;
    })
  );
}

function emptyMessage(message) {
  const element = document.createElement("p");
  element.className = "empty";
  element.textContent = message;
  return element;
}
