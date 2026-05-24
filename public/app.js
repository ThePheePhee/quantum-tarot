const drawButton = document.querySelector("#drawButton");
const reseedButton = document.querySelector("#reseedButton");
const statusText = document.querySelector("#statusText");
const spread = document.querySelector("#spread");
const receiptState = document.querySelector("#receiptState");
const receiptSource = document.querySelector("#receiptSource");
const receiptTime = document.querySelector("#receiptTime");
const receiptEntropy = document.querySelector("#receiptEntropy");
const receiptSeed = document.querySelector("#receiptSeed");

const positions = ["Past", "Present", "Future"];
let seeded = false;

await refreshStatus();

drawButton.addEventListener("click", async () => {
  setBusy(drawButton, true);
  await requestDraw();
  setBusy(drawButton, false);
});

reseedButton.addEventListener("click", async () => {
  setBusy(reseedButton, true);
  statusText.textContent = "Contacting ANU Quantum Numbers...";

  try {
    const result = await postJson("/api/reseed");
    seeded = true;
    drawButton.disabled = false;
    statusText.textContent = `Seed ${result.seedVersion} received from ${result.source}.`;
    renderReceipt(result);
  } catch (error) {
    statusText.textContent = error.message;
  } finally {
    setBusy(reseedButton, false);
  }
});

async function refreshStatus() {
  const response = await fetch("/api/status");
  const status = await response.json();

  seeded = status.seeded;
  drawButton.disabled = !seeded;
  statusText.textContent = status.seeded
    ? `Seed ${status.seedVersion} is ready.`
    : status.qrngConfigured
      ? "Quantum key configured. Awaiting seed."
    : "Awaiting quantum seed.";

  renderReceipt(status.latestReceipt);
}

async function requestDraw() {
  try {
    const result = await postJson("/api/draw");
    renderSpread(result.cards);
    statusText.textContent = `Spread drawn from seed ${result.seedVersion}.`;
  } catch (error) {
    statusText.textContent = error.message;
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

async function postJson(path) {
  const response = await fetch(path, { method: "POST" });
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

function renderReceipt(receipt) {
  if (!receipt) {
    receiptState.textContent = "Not received yet";
    receiptSource.textContent = "--";
    receiptTime.textContent = "--";
    receiptEntropy.textContent = "--";
    receiptSeed.textContent = "--";
    return;
  }

  receiptState.textContent = `Received seed ${receipt.seedVersion}`;
  receiptSource.textContent = receipt.source;
  receiptTime.textContent = new Date(receipt.receivedAt).toLocaleString();
  receiptEntropy.textContent = `${receipt.entropyBytesUsed} bytes`;
  receiptSeed.textContent = formatSeedHex(receipt.seedHex);
}

function formatSeedHex(seedHex) {
  return seedHex.match(/.{1,2}/g)?.join(" ") ?? seedHex;
}
