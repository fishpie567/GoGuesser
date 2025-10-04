import { locations } from "../data/locations.js";

const STORAGE_KEY = "globetrek-arena-state";
const ONE_DAY = 24 * 60 * 60 * 1000;
const RANKED_PERFECT_THRESHOLD_METERS = 25;
const RANKED_PERFECT_CHAIN_LIMIT = 5;
const ROUNDS_PER_MATCH = 5;

const SENSITIVE_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "whore",
  "slut",
  "cock",
  "cunt",
  "nigg",
  "nazi",
  "fag",
  "retard",
  "kike",
  "spic",
  "chink",
  "dyke",
  "arse",
  "bastard",
  "dick",
  "twat",
  "vagina",
  "penis",
];

const avatarCatalog = [
  { id: "avatar-constellation", label: "Constellation", symbol: "🌌", cost: 0 },
  { id: "avatar-fox", label: "Aurora Fox", symbol: "🦊", cost: 80 },
  { id: "avatar-astronaut", label: "Astronaut", symbol: "🧑‍🚀", cost: 120 },
  { id: "avatar-compass", label: "Compass", symbol: "🧭", cost: 60 },
  { id: "avatar-camera", label: "Shutterbug", symbol: "📷", cost: 70 },
  { id: "avatar-dragon", label: "Sky Dragon", symbol: "🐉", cost: 150 },
];

const decorationCatalog = [
  {
    id: "deco-aurora",
    label: "Aurora Trail",
    gradient: "linear-gradient(135deg, #7c5cff, #36e7ff)",
    cost: 0,
  },
  {
    id: "deco-solstice",
    label: "Solstice Ember",
    gradient: "linear-gradient(135deg, #ff6b81, #ffc371)",
    cost: 110,
  },
  {
    id: "deco-midnight",
    label: "Midnight Pulse",
    gradient: "linear-gradient(135deg, #141a33, #7c5cff)",
    cost: 70,
  },
  {
    id: "deco-neon",
    label: "Neon Circuit",
    gradient: "linear-gradient(135deg, #36e7ff, #7af8d8)",
    cost: 95,
  },
  {
    id: "deco-sunrise",
    label: "Sunrise Summit",
    gradient: "linear-gradient(135deg, #ff9a9e, #fad0c4)",
    cost: 130,
  },
];

const rankStructure = [
  { name: "Bronze", stages: 3, winsRequired: 15 },
  { name: "Silver", stages: 3, winsRequired: 20 },
  { name: "Gold", stages: 3, winsRequired: 25 },
  { name: "Platinum", stages: 3, winsRequired: 30 },
  { name: "Diamond", stages: 3, winsRequired: 35 },
  { name: "Mythic", stages: 3, winsRequired: 40 },
  { name: "Legendary", stages: 1, winsRequired: 0 },
];

function getDefaultState() {
  return {
    profile: {
      username: "Rookie Explorer",
      avatar: "avatar-constellation",
      decoration: "deco-aurora",
      coins: 120,
    },
    stats: {
      wins: 0,
      losses: 0,
      bestStreak: 0,
      currentStreak: 0,
    },
    cosmeticsOwned: {
      avatars: ["avatar-constellation"],
      decorations: ["deco-aurora"],
    },
    rank: {
      tierIndex: 0,
      stage: 1,
      progress: 0,
    },
    history: [],
    reports: [],
    restrictions: {
      rankedBanUntil: null,
      perfectChain: 0,
    },
  };
}

function loadState() {
  const defaults = getDefaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
      profile: { ...defaults.profile, ...parsed.profile },
      stats: { ...defaults.stats, ...parsed.stats },
      cosmeticsOwned: {
        avatars: Array.isArray(parsed?.cosmeticsOwned?.avatars)
          ? parsed.cosmeticsOwned.avatars
          : defaults.cosmeticsOwned.avatars,
        decorations: Array.isArray(parsed?.cosmeticsOwned?.decorations)
          ? parsed.cosmeticsOwned.decorations
          : defaults.cosmeticsOwned.decorations,
      },
      rank: { ...defaults.rank, ...parsed.rank },
      history: Array.isArray(parsed.history) ? parsed.history : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      restrictions: { ...defaults.restrictions, ...parsed.restrictions },
    };
  } catch (error) {
    console.error("Failed to parse stored state", error);
    return defaults;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function containsBannedTerm(value) {
  const normalized = normalizeText(value.replace(/[^a-zA-Z0-9]/g, ""));
  return SENSITIVE_WORDS.some((word) => normalized.includes(word));
}

function getAvatarById(id) {
  return avatarCatalog.find((item) => item.id === id) || avatarCatalog[0];
}

function getDecorationById(id) {
  return decorationCatalog.find((item) => item.id === id) || decorationCatalog[0];
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function formatDistance(meters) {
  if (meters < 1000) {
    return `${meters.toFixed(0)} m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(km > 100 ? 0 : km > 10 ? 1 : 2)} km`;
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getStageTarget(tierIndex, stage) {
  const tier = rankStructure[tierIndex];
  if (!tier) return Infinity;
  if (tier.stages === 1) return 999999;
  const perStage = Math.ceil(tier.winsRequired / tier.stages);
  return perStage;
}

function getRankLabel(rankState) {
  const tier = rankStructure[rankState.tierIndex];
  if (!tier) return "Unranked";
  if (tier.stages === 1) {
    return tier.name;
  }
  return `${tier.name} ${["I", "II", "III"][Math.max(0, Math.min(2, rankState.stage - 1))]}`;
}

let state = loadState();

const elements = {
  locationImage: document.getElementById("locationImage"),
  clueText: document.getElementById("clueText"),
  description: document.getElementById("locationDescription"),
  roundCounter: document.getElementById("roundCounter"),
  scoreCounter: document.getElementById("scoreCounter"),
  timerDisplay: document.getElementById("timerDisplay"),
  hintButton: document.getElementById("hintButton"),
  guessButton: document.getElementById("guessButton"),
  revealButton: document.getElementById("revealButton"),
  feedback: document.getElementById("feedback"),
  centerButton: document.getElementById("centerButton"),
  modeToggle: document.getElementById("modeToggle"),
  modeLabel: document.getElementById("modeLabel"),
  rankedStatus: document.getElementById("rankedStatus"),
  avatarWrapper: document.getElementById("avatarWrapper"),
  displayName: document.getElementById("displayName"),
  rankLabel: document.getElementById("rankLabel"),
  coinsLabel: document.getElementById("coinsLabel"),
  winsStat: document.getElementById("winsStat"),
  lossesStat: document.getElementById("lossesStat"),
  streakStat: document.getElementById("streakStat"),
  currentStreakStat: document.getElementById("currentStreakStat"),
  storeList: document.getElementById("storeList"),
  historyList: document.getElementById("historyList"),
  clearHistory: document.getElementById("clearHistory"),
  profileButton: document.getElementById("profileButton"),
  profileModal: document.getElementById("profileModal"),
  usernameInput: document.getElementById("usernameInput"),
  avatarOptions: document.getElementById("avatarOptions"),
  decorationOptions: document.getElementById("decorationOptions"),
  profileForm: document.getElementById("profileForm"),
  closeProfile: document.getElementById("closeProfile"),
  cancelProfile: document.getElementById("cancelProfile"),
  reportsButton: document.getElementById("reportsButton"),
  reportsModal: document.getElementById("reportsModal"),
  reportForm: document.getElementById("reportForm"),
  closeReport: document.getElementById("closeReport"),
  cancelReport: document.getElementById("cancelReport"),
  reportTarget: document.getElementById("reportTarget"),
  downloadReports: document.getElementById("downloadReports"),
  historyTemplate: document.getElementById("historyItemTemplate"),
};

let rankedMode = false;
let map;
let guessMarker;
let targetMarker;
let guessLine;
let currentLocation;
let usedLocations = [];
let pendingGuess = null;
let guessResolved = false;
let timerInterval = null;
let matchStartTime = null;
let currentRound = 0;
let totalScore = 0;
let perfectChain = state.restrictions?.perfectChain || 0;
let distances = [];

function initMap() {
  map = L.map("map", {
    worldCopyJump: true,
    zoomControl: false,
  }).setView([20, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  map.on("click", (event) => {
    if (guessResolved) return;
    pendingGuess = event.latlng;
    if (!guessMarker) {
      guessMarker = L.marker(pendingGuess, {
        draggable: false,
        title: "Your guess",
      }).addTo(map);
    } else {
      guessMarker.setLatLng(pendingGuess);
    }
    elements.guessButton.disabled = false;
    elements.guessButton.textContent = "Lock guess";
  });
}

function resetMap() {
  if (guessMarker) {
    map.removeLayer(guessMarker);
    guessMarker = null;
  }
  if (targetMarker) {
    map.removeLayer(targetMarker);
    targetMarker = null;
  }
  if (guessLine) {
    map.removeLayer(guessLine);
    guessLine = null;
  }
  pendingGuess = null;
  guessResolved = false;
  elements.revealButton.disabled = true;
  elements.guessButton.disabled = true;
  elements.guessButton.dataset.state = "guess";
  elements.guessButton.textContent = "Lock guess";
  map.setView([20, 0], 2);
}

function pickLocation() {
  if (usedLocations.length === locations.length) {
    usedLocations = [];
  }
  const available = locations.filter((item) => !usedLocations.includes(item.id));
  const choice = available[Math.floor(Math.random() * available.length)];
  usedLocations.push(choice.id);
  return choice;
}

function updateProfileUI() {
  const avatar = getAvatarById(state.profile.avatar);
  const deco = getDecorationById(state.profile.decoration);
  elements.avatarWrapper.textContent = avatar.symbol;
  elements.avatarWrapper.style.border = "3px solid transparent";
  elements.avatarWrapper.style.backgroundImage = `${deco.gradient}, rgba(12,17,41,0.65)`;
  elements.avatarWrapper.style.backgroundOrigin = "border-box";
  elements.avatarWrapper.style.backgroundClip = "border-box, padding-box";
  elements.displayName.textContent = state.profile.username;
  elements.displayName.style.backgroundImage = deco.gradient;
  elements.displayName.style.webkitBackgroundClip = "text";
  elements.displayName.style.webkitTextFillColor = "transparent";
  elements.displayName.style.backgroundClip = "text";
  elements.displayName.style.color = "#f4f6ff";
  elements.rankLabel.textContent = getRankLabel(state.rank);
  elements.coinsLabel.textContent = `${state.profile.coins} coins`;
  elements.winsStat.textContent = state.stats.wins;
  elements.lossesStat.textContent = state.stats.losses;
  elements.streakStat.textContent = state.stats.bestStreak;
  elements.currentStreakStat.textContent = state.stats.currentStreak;
}

function renderStore() {
  elements.storeList.innerHTML = "";
  const fragment = document.createDocumentFragment();

  const catalog = [
    ...avatarCatalog.map((item) => ({ ...item, type: "avatar" })),
    ...decorationCatalog.map((item) => ({ ...item, type: "decoration" })),
  ];

  catalog.forEach((item) => {
    const li = document.createElement("div");
    li.className = "store-item";
    if (
      (item.type === "avatar" && state.cosmeticsOwned.avatars.includes(item.id)) ||
      (item.type === "decoration" && state.cosmeticsOwned.decorations.includes(item.id))
    ) {
      li.classList.add("purchased");
    }

    const preview = document.createElement("div");
    preview.className = "store-preview";
    preview.textContent = item.type === "avatar" ? item.symbol : "";
    if (item.type === "decoration") {
      preview.style.background = item.gradient;
    }

    const meta = document.createElement("div");
    meta.className = "item-meta";
    const title = document.createElement("p");
    title.textContent = item.label;
    title.style.fontWeight = 600;
    const subtitle = document.createElement("p");
    subtitle.style.fontSize = "0.8rem";
    subtitle.style.color = "var(--text-muted)";
    subtitle.textContent = item.type === "avatar" ? "Profile picture" : "Nameplate";
    meta.append(title, subtitle);

    const action = document.createElement("button");
    action.className = "ghost-button";
    const owned =
      (item.type === "avatar" && state.cosmeticsOwned.avatars.includes(item.id)) ||
      (item.type === "decoration" && state.cosmeticsOwned.decorations.includes(item.id));

    if (owned) {
      action.disabled = true;
      action.textContent = "Owned";
    } else {
      action.textContent = `${item.cost} coins`;
      action.addEventListener("click", () => handlePurchase(item));
    }

    li.append(preview, meta, action);
    fragment.append(li);
  });

  elements.storeList.append(fragment);
}

function renderHistory() {
  elements.historyList.innerHTML = "";
  const entries = [...state.history].slice(-20).reverse();
  const template = elements.historyTemplate;
  entries.forEach((entry) => {
    const clone = template.content.cloneNode(true);
    const li = clone.querySelector(".history-item");
    if (entry.outcome === "win") li.classList.add("win");
    if (entry.outcome === "loss") li.classList.add("loss");
    clone.querySelector(".summary").textContent = `${entry.mode.toUpperCase()} • ${
      entry.outcome === "win" ? "Victory" : "Defeat"
    } • ${entry.score} pts`;
    clone
      .querySelector(".meta")
      .textContent = `${formatDate(entry.timestamp)} • avg ${formatDistance(entry.averageDistance)}`;
    elements.historyList.appendChild(clone);
  });
}

function renderRankedStatus() {
  const { rankedBanUntil } = state.restrictions;
  if (rankedBanUntil && Date.now() < rankedBanUntil) {
    const remaining = rankedBanUntil - Date.now();
    const hours = Math.ceil(remaining / (60 * 60 * 1000));
    elements.rankedStatus.textContent = `Ranked suspended for ${hours}h due to suspicious precision.`;
    elements.rankedStatus.classList.add("alert");
    elements.modeToggle.checked = false;
    elements.modeToggle.disabled = true;
    rankedMode = false;
    elements.modeLabel.textContent = "Casual";
  } else {
    if (rankedBanUntil && Date.now() >= rankedBanUntil) {
      state.restrictions.rankedBanUntil = null;
      saveState();
    }
    elements.modeToggle.disabled = false;
    elements.modeToggle.checked = rankedMode;
    elements.rankedStatus.classList.toggle("alert", rankedMode);
    elements.rankedStatus.textContent = rankedMode
      ? "Ranked: tougher scoring, track your promotion progress."
      : "Casual: relaxed exploring without rank pressure.";
  }
}

function handlePurchase(item) {
  if (state.profile.coins < item.cost) {
    alert("Not enough coins. Win more matches to earn coins!");
    return;
  }
  state.profile.coins -= item.cost;
  if (item.type === "avatar") {
    state.cosmeticsOwned.avatars.push(item.id);
  } else {
    state.cosmeticsOwned.decorations.push(item.id);
  }
  saveState();
  updateProfileUI();
  renderStore();
  renderAvatarOptions();
  renderDecorationOptions();
}

function renderAvatarOptions() {
  elements.avatarOptions.innerHTML = "";
  avatarCatalog.forEach((avatar) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "avatar-option";
    option.textContent = avatar.symbol;
    const owned = state.cosmeticsOwned.avatars.includes(avatar.id);
    if (!owned) {
      option.classList.add("locked");
      option.disabled = true;
    }
    if (avatar.id === state.profile.avatar) {
      option.classList.add("selected");
    }
    option.addEventListener("click", () => {
      if (!owned) return;
      state.profile.avatar = avatar.id;
      renderAvatarOptions();
      updateProfileUI();
      saveState();
    });
    elements.avatarOptions.appendChild(option);
  });
}

function renderDecorationOptions() {
  elements.decorationOptions.innerHTML = "";
  decorationCatalog.forEach((decor) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "decoration-option";
    const preview = document.createElement("div");
    preview.className = "decoration-preview";
    preview.style.background = decor.gradient;
    option.appendChild(preview);
    const owned = state.cosmeticsOwned.decorations.includes(decor.id);
    if (!owned) {
      option.classList.add("locked");
      option.disabled = true;
    }
    if (decor.id === state.profile.decoration) {
      option.classList.add("selected");
    }
    option.addEventListener("click", () => {
      if (!owned) return;
      state.profile.decoration = decor.id;
      renderDecorationOptions();
      updateProfileUI();
      saveState();
    });
    elements.decorationOptions.appendChild(option);
  });
}

function resetMatch() {
  currentRound = 0;
  totalScore = 0;
  distances = [];
  elements.scoreCounter.textContent = "0";
  elements.roundCounter.textContent = `0 / ${ROUNDS_PER_MATCH}`;
  elements.feedback.textContent = "";
  matchStartTime = Date.now();
  clearInterval(timerInterval);
  elements.timerDisplay.textContent = "00:00";
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - matchStartTime) / 1000);
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const seconds = String(elapsed % 60).padStart(2, "0");
    elements.timerDisplay.textContent = `${minutes}:${seconds}`;
  }, 1000);
  nextRound();
}

function nextRound() {
  currentRound += 1;
  if (currentRound > ROUNDS_PER_MATCH) {
    endMatch();
    return;
  }
  currentLocation = pickLocation();
  elements.locationImage.src = currentLocation.image;
  elements.locationImage.alt = `Photo from ${currentLocation.name}`;
  elements.clueText.textContent = currentLocation.clue;
  elements.clueText.classList.remove("visible");
  elements.description.textContent = currentLocation.description;
  elements.roundCounter.textContent = `${currentRound} / ${ROUNDS_PER_MATCH}`;
  elements.feedback.textContent = "";
  resetMap();
}

function handleHint() {
  elements.clueText.classList.add("visible");
}

function handleGuess() {
  if (elements.guessButton.dataset.state === "next") {
    nextRound();
    return;
  }
  if (!pendingGuess || !currentLocation) return;

  const distance = haversineDistance(
    pendingGuess.lat,
    pendingGuess.lng,
    currentLocation.lat,
    currentLocation.lng
  );
  distances.push(distance);
  const score = Math.max(0, Math.round(5000 - (distance / 1000) * (rankedMode ? 9 : 6)));
  totalScore += score;
  guessResolved = true;
  elements.feedback.textContent = `You were ${formatDistance(
    distance
  )} away from ${currentLocation.name}. +${score} pts`;
  elements.revealButton.disabled = false;
  elements.guessButton.dataset.state = "next";
  elements.guessButton.textContent = currentRound === ROUNDS_PER_MATCH ? "Finish match" : "Next round";
  elements.scoreCounter.textContent = totalScore;

  if (rankedMode) {
    if (distance <= RANKED_PERFECT_THRESHOLD_METERS) {
      perfectChain += 1;
      state.restrictions.perfectChain = perfectChain;
      if (perfectChain >= RANKED_PERFECT_CHAIN_LIMIT) {
        state.restrictions.rankedBanUntil = Date.now() + ONE_DAY;
        perfectChain = 0;
        state.restrictions.perfectChain = 0;
        saveState();
        renderRankedStatus();
        alert(
          "Auto mod: Your pinpoint streak triggered a 24h ranked timeout. Contact support if this was a mistake."
        );
      }
    } else {
      perfectChain = 0;
      state.restrictions.perfectChain = 0;
    }
  } else {
    perfectChain = 0;
    state.restrictions.perfectChain = 0;
  }
  saveState();
}

function revealAnswer() {
  if (!currentLocation) return;
  const locationLatLng = L.latLng(currentLocation.lat, currentLocation.lng);
  if (!targetMarker) {
    targetMarker = L.marker(locationLatLng, {
      title: currentLocation.name,
      icon: L.icon({
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        shadowSize: [41, 41],
      }),
    }).addTo(map);
  }
  targetMarker.setLatLng(locationLatLng);
  targetMarker.bindPopup(currentLocation.name).openPopup();
  if (pendingGuess) {
    guessLine = L.polyline([pendingGuess, locationLatLng], {
      color: "#36e7ff",
      weight: 3,
    }).addTo(map);
    const bounds = L.latLngBounds([pendingGuess, locationLatLng]);
    map.fitBounds(bounds.pad(0.25));
  } else {
    map.setView(locationLatLng, 6);
  }
  elements.revealButton.disabled = true;
}

function endMatch() {
  clearInterval(timerInterval);
  timerInterval = null;
  const averageDistance = distances.length
    ? distances.reduce((sum, value) => sum + value, 0) / distances.length
    : Infinity;
  const outcome = totalScore >= (rankedMode ? 15000 : 12000) ? "win" : "loss";
  const coinsEarned = outcome === "win" ? (rankedMode ? 120 : 80) : 0;
  if (coinsEarned) {
    state.profile.coins += coinsEarned;
  }
  updateMatchHistory({
    mode: rankedMode ? "ranked" : "casual",
    outcome,
    score: totalScore,
    averageDistance,
  });
  if (outcome === "win") {
    state.stats.wins += 1;
    state.stats.currentStreak += 1;
    state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.currentStreak);
  } else {
    state.stats.losses += 1;
    state.stats.currentStreak = 0;
  }

  if (rankedMode && (!state.restrictions.rankedBanUntil || Date.now() >= state.restrictions.rankedBanUntil)) {
    updateRank(outcome === "win");
  }

  saveState();
  updateProfileUI();
  renderHistory();
  renderRankedStatus();

  const message = outcome === "win"
    ? `Victory! You banked ${totalScore} pts${coinsEarned ? ` and ${coinsEarned} coins.` : "."}`
    : `Defeat. ${totalScore} pts. Study the world and try again!`;
  elements.feedback.textContent = message;
  elements.guessButton.disabled = true;
  elements.revealButton.disabled = true;
}

function updateMatchHistory(entry) {
  const historyEntry = {
    ...entry,
    timestamp: Date.now(),
  };
  state.history.push(historyEntry);
  if (state.history.length > 60) {
    state.history = state.history.slice(-60);
  }
}

function updateRank(didWin) {
  const rankState = state.rank;
  const tier = rankStructure[rankState.tierIndex];
  if (!tier) return;
  if (didWin) {
    rankState.progress += 1;
    const target = getStageTarget(rankState.tierIndex, rankState.stage);
    if (rankState.progress >= target) {
      rankState.progress = 0;
      if (rankState.stage < tier.stages) {
        rankState.stage += 1;
      } else if (rankState.tierIndex < rankStructure.length - 1) {
        rankState.tierIndex += 1;
        rankState.stage = 1;
      }
    }
  } else {
    rankState.progress = Math.max(0, rankState.progress - 1);
  }
}

function clearHistory() {
  if (!confirm("Clear match history?")) return;
  state.history = [];
  saveState();
  renderHistory();
}

function openProfileModal() {
  elements.usernameInput.value = state.profile.username;
  renderAvatarOptions();
  renderDecorationOptions();
  elements.profileModal.showModal();
}

function openReportModal() {
  elements.reportForm.reset();
  elements.reportsModal.showModal();
}

function handleProfileSubmit(event) {
  event.preventDefault();
  const desiredName = elements.usernameInput.value.trim();
  if (!desiredName) {
    alert("Display name cannot be empty.");
    return;
  }
  if (containsBannedTerm(desiredName)) {
    alert("This name contains blocked words. Please choose something respectful.");
    return;
  }
  state.profile.username = desiredName;
  saveState();
  updateProfileUI();
  elements.profileModal.close();
}

function closeProfileModal() {
  elements.profileModal.close();
}

function handleReportSubmit(event) {
  event.preventDefault();
  const formData = new FormData(elements.reportForm);
  const target = formData.get("reportTarget")?.toString().trim();
  const reason = formData.get("reason");
  const notes = formData.get("notes")?.toString().trim() ?? "";
  if (!target || !reason) {
    alert("Provide a username and select a reason to file a report.");
    return;
  }
  const report = {
    id: generateId(),
    target,
    reason,
    notes,
    submittedAt: Date.now(),
  };
  state.reports.push(report);
  if (state.reports.length > 200) {
    state.reports = state.reports.slice(-200);
  }
  saveState();
  alert("Report submitted. We'll review it shortly.");
  elements.reportsModal.close();
}

function closeReportModal() {
  elements.reportsModal.close();
}

function downloadReports() {
  if (!state.reports.length) {
    alert("No reports yet.");
    return;
  }
  const blob = new Blob([JSON.stringify(state.reports, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "globetrek-reports.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function handleModeToggle(event) {
  const desired = event.target.checked;
  if (desired && state.restrictions.rankedBanUntil && Date.now() < state.restrictions.rankedBanUntil) {
    renderRankedStatus();
    return;
  }
  rankedMode = desired;
  elements.modeLabel.textContent = rankedMode ? "Ranked" : "Casual";
  renderRankedStatus();
  resetMatch();
}

function initEventListeners() {
  elements.hintButton.addEventListener("click", handleHint);
  elements.guessButton.addEventListener("click", handleGuess);
  elements.revealButton.addEventListener("click", revealAnswer);
  elements.centerButton.addEventListener("click", () => map.setView([20, 0], 2));
  elements.clearHistory.addEventListener("click", clearHistory);
  elements.profileButton.addEventListener("click", openProfileModal);
  elements.closeProfile.addEventListener("click", closeProfileModal);
  elements.cancelProfile.addEventListener("click", closeProfileModal);
  elements.profileForm.addEventListener("submit", handleProfileSubmit);
  elements.reportsButton.addEventListener("click", openReportModal);
  elements.closeReport.addEventListener("click", closeReportModal);
  elements.cancelReport.addEventListener("click", closeReportModal);
  elements.reportForm.addEventListener("submit", handleReportSubmit);
  elements.downloadReports.addEventListener("click", downloadReports);
  elements.modeToggle.addEventListener("change", handleModeToggle);
}

function start() {
  updateProfileUI();
  renderStore();
  renderHistory();
  renderRankedStatus();
  initMap();
  resetMatch();
}

initEventListeners();
start();
