import {
  AVATARS,
  DECORATIONS,
  RANKS,
  LOCATIONS,
  BANNED_WORDS,
  GAME_CONSTANTS,
} from "../data/constants.js";
import {
  loadState,
  saveState,
  purchaseCosmetic,
  recordMatchOutcome,
  canUseRanked,
  flagRankedTimeout,
  pushReport,
  storeReports,
  bumpPerfectChain,
} from "./state.js";
import { PeerNetwork } from "./network.js";

const state = loadState();
const network = new PeerNetwork();

const players = new Map();
let localPlayer = {
  playerId: null,
  username: state.profile.username,
  avatar: state.profile.avatar,
  decoration: state.profile.decoration,
  isHost: false,
  coins: state.profile.coins,
};
let game = {
  ranked: false,
  round: 0,
  totalRounds: GAME_CONSTANTS.roundsPerMatch,
  locationPool: [...LOCATIONS],
  currentLocation: null,
  guesses: new Map(),
  timerInterval: null,
  timerDeadline: null,
  started: false,
  revealTimeout: null,
};

let map;
let guessMarker;
let isDraggingGuess = false;
let selectedLatLng = null;
let pendingReportTarget = null;

const elements = {
  connectionBadge: document.getElementById("connectionBadge"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  createRoomButton: document.getElementById("createRoomButton"),
  joinRoomButton: document.getElementById("joinRoomButton"),
  rankedToggle: document.getElementById("rankedToggle"),
  banNotice: document.getElementById("banNotice"),
  playerList: document.getElementById("playerList"),
  playerCount: document.getElementById("playerCount"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  chatLog: document.getElementById("chatLog"),
  roundCounter: document.getElementById("roundCounter"),
  timerDisplay: document.getElementById("timerDisplay"),
  gameStatus: document.getElementById("gameStatus"),
  sceneImage: document.getElementById("sceneImage"),
  sceneOverlay: document.getElementById("sceneOverlay"),
  clueText: document.getElementById("clueText"),
  hintButton: document.getElementById("hintButton"),
  lockGuessButton: document.getElementById("lockGuessButton"),
  centerButton: document.getElementById("centerButton"),
  revealButton: document.getElementById("revealButton"),
  feedback: document.getElementById("feedback"),
  scoreboardList: document.getElementById("scoreboardList"),
  storeButton: document.getElementById("storeButton"),
  reportsButton: document.getElementById("reportsButton"),
  profileButton: document.getElementById("profileButton"),
  profileDrawer: document.getElementById("profileDrawer"),
  avatarPreview: document.getElementById("avatarPreview"),
  profileName: document.getElementById("profileName"),
  rankLabel: document.getElementById("rankLabel"),
  coinsLabel: document.getElementById("coinsLabel"),
  winsStat: document.getElementById("winsStat"),
  lossesStat: document.getElementById("lossesStat"),
  bestStreakStat: document.getElementById("bestStreakStat"),
  currentStreakStat: document.getElementById("currentStreakStat"),
  ownedCosmetics: document.getElementById("ownedCosmetics"),
  profileModal: document.getElementById("profileModal"),
  profileForm: document.getElementById("profileForm"),
  usernameInput: document.getElementById("usernameInput"),
  usernameWarning: document.getElementById("usernameWarning"),
  avatarOptions: document.getElementById("avatarOptions"),
  decorationOptions: document.getElementById("decorationOptions"),
  storeModal: document.getElementById("storeModal"),
  storeAvatars: document.getElementById("storeAvatars"),
  storeDecorations: document.getElementById("storeDecorations"),
  closeStoreButton: document.getElementById("closeStoreButton"),
  reportsModal: document.getElementById("reportsModal"),
  reportsList: document.getElementById("reportsList"),
  exportReportsButton: document.getElementById("exportReportsButton"),
  clearReportsButton: document.getElementById("clearReportsButton"),
  closeReportsButton: document.getElementById("closeReportsButton"),
  reportPlayerModal: document.getElementById("reportPlayerModal"),
  reportPlayerName: document.getElementById("reportPlayerName"),
  reportDetails: document.getElementById("reportDetails"),
  submitReportButton: document.getElementById("submitReportButton"),
  cancelReportButton: document.getElementById("cancelReportButton"),
  toast: document.getElementById("toast"),
  ownedCosmeticsContainer: document.getElementById("ownedCosmetics"),
};

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  elements.toast.classList.remove("hidden");
  setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2800);
}

function formatRank(stateRank) {
  const tier = RANKS[stateRank.tierIndex] || RANKS[0];
  if (tier.stages === 1) {
    return tier.name;
  }
  const roman = ["I", "II", "III", "IV", "V"];
  const idx = Math.min(roman.length - 1, Math.max(0, stageIndex(stateRank.stage)));
  const stageRoman = roman[idx];
  return `${tier.name} ${stageRoman}`;
}

function stageIndex(stage) {
  return Number(stage || 1) - 1;
}

function sanitizeName(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length < 3 || trimmed.length > 16) {
    return "";
  }
  const lower = trimmed.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) {
      return "";
    }
  }
  return trimmed;
}

function updateProfileUI() {
  localPlayer.username = state.profile.username;
  localPlayer.avatar = state.profile.avatar;
  localPlayer.decoration = state.profile.decoration;
  localPlayer.coins = state.profile.coins;
  elements.avatarPreview.textContent = getAvatarSymbol(localPlayer.avatar);
  elements.avatarPreview.style.background = "rgba(118,247,255,0.12)";
  elements.profileName.textContent = state.profile.username;
  const decoration = DECORATIONS.find((d) => d.id === state.profile.decoration);
  if (decoration) {
    elements.profileName.style.backgroundImage = decoration.gradient;
    elements.profileName.style.webkitBackgroundClip = "text";
    elements.profileName.style.backgroundClip = "text";
    elements.profileName.style.color = "transparent";
  } else {
    elements.profileName.style.backgroundImage = "none";
    elements.profileName.style.color = "var(--text-primary)";
  }
  elements.rankLabel.textContent = formatRank(state.rank);
  elements.coinsLabel.textContent = `${state.profile.coins} coins`;
  elements.winsStat.textContent = state.stats.wins;
  elements.lossesStat.textContent = state.stats.losses;
  elements.bestStreakStat.textContent = state.stats.bestStreak;
  elements.currentStreakStat.textContent = state.stats.currentStreak;
  renderOwnedCosmetics();
}

function renderOwnedCosmetics() {
  elements.ownedCosmetics.innerHTML = "";
  state.cosmeticsOwned.avatars.forEach((avatarId) => {
    const avatar = AVATARS.find((a) => a.id === avatarId);
    if (!avatar) return;
    const chip = document.createElement("div");
    chip.className = "owned-chip";
    chip.textContent = `${avatar.symbol} ${avatar.label}`;
    elements.ownedCosmetics.appendChild(chip);
  });
  state.cosmeticsOwned.decorations.forEach((decoId) => {
    const deco = DECORATIONS.find((d) => d.id === decoId);
    if (!deco) return;
    const chip = document.createElement("div");
    chip.className = "owned-chip";
    chip.textContent = deco.label;
    chip.style.background = deco.gradient;
    chip.style.color = "#05050f";
    elements.ownedCosmetics.appendChild(chip);
  });
}

function renderProfileModal() {
  elements.usernameInput.value = state.profile.username;
  elements.avatarOptions.innerHTML = "";
  elements.decorationOptions.innerHTML = "";
  AVATARS.forEach((avatar) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "option-card";
    if (!state.cosmeticsOwned.avatars.has(avatar.id)) {
      card.classList.add("locked");
    }
    if (avatar.id === state.profile.avatar) {
      card.classList.add("active");
    }
    const display = document.createElement("div");
    display.className = "avatar-display";
    display.textContent = avatar.symbol;
    card.appendChild(display);
    const label = document.createElement("span");
    label.textContent = avatar.label;
    card.appendChild(label);
    if (avatar.cost) {
      const cost = document.createElement("small");
      cost.textContent = `${avatar.cost} coins`;
      card.appendChild(cost);
    }
    card.addEventListener("click", () => {
      if (!state.cosmeticsOwned.avatars.has(avatar.id)) {
        showToast("Unlock this avatar in the cosmetics shop.");
        return;
      }
      state.profile.avatar = avatar.id;
      renderProfileModal();
      updateProfileUI();
      saveState(state);
    });
    elements.avatarOptions.appendChild(card);
  });
  DECORATIONS.forEach((deco) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "option-card";
    if (!state.cosmeticsOwned.decorations.has(deco.id)) {
      card.classList.add("locked");
    }
    if (deco.id === state.profile.decoration) {
      card.classList.add("active");
    }
    const display = document.createElement("div");
    display.className = "nameplate-display";
    display.style.background = deco.gradient;
    display.textContent = state.profile.username;
    card.appendChild(display);
    const label = document.createElement("span");
    label.textContent = deco.label;
    card.appendChild(label);
    if (deco.cost) {
      const cost = document.createElement("small");
      cost.textContent = `${deco.cost} coins`;
      card.appendChild(cost);
    }
    card.addEventListener("click", () => {
      if (!state.cosmeticsOwned.decorations.has(deco.id)) {
        showToast("Unlock this nameplate in the cosmetics shop.");
        return;
      }
      state.profile.decoration = deco.id;
      renderProfileModal();
      updateProfileUI();
      saveState(state);
    });
    elements.decorationOptions.appendChild(card);
  });
}

function renderStore() {
  elements.storeAvatars.innerHTML = "";
  elements.storeDecorations.innerHTML = "";
  AVATARS.forEach((avatar) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "option-card";
    if (state.cosmeticsOwned.avatars.has(avatar.id)) {
      card.classList.add("active");
    }
    const display = document.createElement("div");
    display.className = "avatar-display";
    display.textContent = avatar.symbol;
    card.appendChild(display);
    const label = document.createElement("span");
    label.textContent = avatar.label;
    card.appendChild(label);
    const cost = document.createElement("small");
    cost.textContent = `${avatar.cost} coins`;
    card.appendChild(cost);
    card.addEventListener("click", () => {
      if (state.cosmeticsOwned.avatars.has(avatar.id)) {
        showToast("Already owned.");
        return;
      }
      if (!purchaseCosmetic(state, "avatar", avatar.id)) {
        showToast("Not enough coins.");
        return;
      }
      saveState(state);
      renderStore();
      renderProfileModal();
      updateProfileUI();
      showToast(`Unlocked ${avatar.label}!`);
    });
    elements.storeAvatars.appendChild(card);
  });
  DECORATIONS.forEach((deco) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "option-card";
    if (state.cosmeticsOwned.decorations.has(deco.id)) {
      card.classList.add("active");
    }
    const display = document.createElement("div");
    display.className = "nameplate-display";
    display.style.background = deco.gradient;
    display.textContent = state.profile.username;
    card.appendChild(display);
    const label = document.createElement("span");
    label.textContent = deco.label;
    card.appendChild(label);
    const cost = document.createElement("small");
    cost.textContent = `${deco.cost} coins`;
    card.appendChild(cost);
    card.addEventListener("click", () => {
      if (state.cosmeticsOwned.decorations.has(deco.id)) {
        showToast("Already owned.");
        return;
      }
      if (!purchaseCosmetic(state, "decoration", deco.id)) {
        showToast("Not enough coins.");
        return;
      }
      saveState(state);
      renderStore();
      renderProfileModal();
      updateProfileUI();
      showToast(`Unlocked ${deco.label}!`);
    });
    elements.storeDecorations.appendChild(card);
  });
}

function getAvatarSymbol(avatarId) {
  return AVATARS.find((avatar) => avatar.id === avatarId)?.symbol || "🎯";
}

function openModal(modal) {
  modal.classList.add("show");
}

function closeModal(modal) {
  modal.classList.remove("show");
}

function updateConnectionStatus(isOnline) {
  if (isOnline) {
    elements.connectionBadge.textContent = "Online";
    elements.connectionBadge.classList.add("online");
    elements.connectionBadge.classList.remove("offline");
  } else {
    elements.connectionBadge.textContent = "Offline";
    elements.connectionBadge.classList.remove("online");
    elements.connectionBadge.classList.add("offline");
  }
}

function resetGame() {
  clearInterval(game.timerInterval);
  clearTimeout(game.revealTimeout);
  game = {
    ranked: game.ranked,
    round: 0,
    totalRounds: GAME_CONSTANTS.roundsPerMatch,
    locationPool: [...LOCATIONS],
    currentLocation: null,
    guesses: new Map(),
    timerInterval: null,
    timerDeadline: null,
    started: false,
    revealTimeout: null,
  };
  elements.roundCounter.textContent = `Round 0 / ${game.totalRounds}`;
  elements.timerDisplay.textContent = "--:--";
  elements.gameStatus.textContent = "Waiting for host…";
  elements.sceneImage.src = "";
  elements.sceneOverlay.classList.remove("hidden");
  elements.clueText.textContent = "—";
  elements.hintButton.disabled = true;
  elements.lockGuessButton.disabled = true;
  elements.lockGuessButton.textContent = "Lock guess";
  elements.revealButton.disabled = true;
  elements.revealButton.textContent = "Start match";
  elements.feedback.textContent = "";
  elements.scoreboardList.innerHTML = "";
  selectedLatLng = null;
  if (guessMarker) {
    map.removeLayer(guessMarker);
    guessMarker = null;
  }
}

function initMap() {
  map = L.map("map", {
    worldCopyJump: true,
    attributionControl: false,
  }).setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
  }).addTo(map);

  map.on("click", (evt) => {
    selectedLatLng = evt.latlng;
    if (!guessMarker) {
      guessMarker = L.marker(evt.latlng, { draggable: true });
      guessMarker.on("dragstart", () => (isDraggingGuess = true));
      guessMarker.on("dragend", (event) => {
        selectedLatLng = event.target.getLatLng();
        isDraggingGuess = false;
      });
      guessMarker.addTo(map);
    } else {
      guessMarker.setLatLng(evt.latlng);
    }
    elements.lockGuessButton.disabled = false;
  });
}

function updateLobbyPlayers() {
  elements.playerList.innerHTML = "";
  players.forEach((player) => {
    const item = document.createElement("li");
    item.className = "player-item";
    const left = document.createElement("div");
    left.className = "player-left";
    const avatar = document.createElement("div");
    avatar.className = "avatar-circle";
    avatar.textContent = getAvatarSymbol(player.avatar);
    left.appendChild(avatar);
    const meta = document.createElement("div");
    const nameplate = document.createElement("div");
    nameplate.className = "nameplate";
    const decoration = DECORATIONS.find((d) => d.id === player.decoration);
    nameplate.style.background = decoration?.gradient || "linear-gradient(135deg,#5051f5,#82f1ff)";
    nameplate.textContent = player.username;
    meta.appendChild(nameplate);
    const status = document.createElement("small");
    status.textContent = player.isHost ? "Host" : "Player";
    status.style.color = "var(--text-secondary)";
    meta.appendChild(status);
    left.appendChild(meta);
    item.appendChild(left);

    const actions = document.createElement("div");
    actions.className = "player-actions";
    const reportBtn = document.createElement("button");
    reportBtn.className = "ghost";
    reportBtn.textContent = "Report";
    reportBtn.addEventListener("click", () => openReportModal(player));
    actions.appendChild(reportBtn);
    if (localPlayer.isHost && !player.isHost) {
      const kickBtn = document.createElement("button");
      kickBtn.className = "ghost";
      kickBtn.textContent = "Kick";
      kickBtn.addEventListener("click", () => kickPlayer(player.playerId));
      actions.appendChild(kickBtn);
    }
    if (player.playerId === localPlayer.playerId) {
      actions.innerHTML = "<span style=\"color:var(--text-secondary);font-size:12px;\">You</span>";
    }
    item.appendChild(actions);
    elements.playerList.appendChild(item);
  });
  elements.playerCount.textContent = players.size;
}

function openReportModal(player) {
  pendingReportTarget = player;
  elements.reportPlayerName.textContent = `${player.username} (${player.playerId === localPlayer.playerId ? "You" : "Player"})`;
  elements.reportDetails.value = "";
  const defaultOption = elements.reportPlayerModal.querySelector("input[name='reportReason'][value='hacker']");
  if (defaultOption) {
    defaultOption.checked = true;
  }
  openModal(elements.reportPlayerModal);
}

function kickPlayer(playerId) {
  if (!localPlayer.isHost) return;
  const conn = network.connections.get(playerId);
  if (conn) {
    conn.send({ type: "KICK", payload: { reason: "Removed by host" } });
    conn.close();
  }
  players.delete(playerId);
  updateLobbyPlayers();
  updateScoreboard();
  network.broadcast("PLAYER_REMOVED", { playerId });
}

function updateScoreboard() {
  const standings = Array.from(players.values()).map((player) => ({
    player,
    score: player.score || 0,
    totalDistance: player.totalDistance || 0,
    lastDistance: player.lastDistance || null,
  }));
  standings.sort((a, b) => b.score - a.score || a.totalDistance - b.totalDistance);
  elements.scoreboardList.innerHTML = "";
  standings.forEach(({ player, score, lastDistance }) => {
    const li = document.createElement("li");
    li.className = "scoreboard-item";
    const left = document.createElement("div");
    left.className = "player-left";
    const avatar = document.createElement("div");
    avatar.className = "avatar-circle";
    avatar.textContent = getAvatarSymbol(player.avatar);
    left.appendChild(avatar);
    const nameplate = document.createElement("div");
    nameplate.className = "nameplate";
    const deco = DECORATIONS.find((d) => d.id === player.decoration);
    nameplate.style.background = deco?.gradient || "linear-gradient(135deg,#5051f5,#82f1ff)";
    nameplate.textContent = player.username;
    left.appendChild(nameplate);
    li.appendChild(left);

    const right = document.createElement("div");
    right.style.textAlign = "right";
    const points = document.createElement("div");
    points.textContent = `${score} pts`;
    right.appendChild(points);
    if (lastDistance != null) {
      const distance = document.createElement("small");
      distance.textContent = `${Math.round(lastDistance)} m`;
      distance.style.color = "var(--text-secondary)";
      right.appendChild(distance);
    }
    li.appendChild(right);
    elements.scoreboardList.appendChild(li);
  });
}

function appendChatMessage({ author, message, system = false }) {
  const entry = document.createElement("div");
  entry.className = system ? "chat-message system" : "chat-message";
  if (system) {
    entry.textContent = message;
  } else {
    const strong = document.createElement("strong");
    strong.textContent = `${author}: `;
    entry.appendChild(strong);
    entry.appendChild(document.createTextNode(message));
  }
  elements.chatLog.appendChild(entry);
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function rollLocation() {
  if (game.locationPool.length === 0) {
    game.locationPool = [...LOCATIONS];
  }
  const index = Math.floor(Math.random() * game.locationPool.length);
  const location = game.locationPool.splice(index, 1)[0];
  return location;
}

function startRound(location) {
  game.currentLocation = location;
  game.round += 1;
  game.guesses.clear();
  game.started = true;
  elements.roundCounter.textContent = `Round ${game.round} / ${game.totalRounds}`;
  elements.gameStatus.textContent = `Round ${game.round} in play`;
  elements.sceneOverlay.classList.add("hidden");
  elements.sceneImage.src = location.image;
  elements.clueText.textContent = location.clue;
  elements.hintButton.disabled = false;
  elements.lockGuessButton.disabled = false;
  elements.lockGuessButton.textContent = "Lock guess";
  elements.revealButton.disabled = true;
  elements.feedback.textContent = "Place your marker and lock in!";
  elements.timerDisplay.textContent = formatTimer(GAME_CONSTANTS.guessTimerSeconds);

  if (guessMarker) {
    map.removeLayer(guessMarker);
    guessMarker = null;
  }
  selectedLatLng = null;

  game.timerDeadline = Date.now() + GAME_CONSTANTS.guessTimerSeconds * 1000;
  clearInterval(game.timerInterval);
  game.timerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.floor((game.timerDeadline - Date.now()) / 1000));
    elements.timerDisplay.textContent = formatTimer(remaining);
    if (remaining <= 0) {
      clearInterval(game.timerInterval);
      if (localPlayer.isHost) {
        finalizeRound();
      }
    }
  }, 500);
}

function formatTimer(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function calculateDistanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const c = 2 * Math.atan2(
    Math.sqrt(sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon),
    Math.sqrt(1 - sinLat * sinLat - Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon)
  );
  return R * c;
}

function handleLocalGuess() {
  if (!selectedLatLng || !game.currentLocation) {
    showToast("Drop your guess on the map first.");
    return;
  }
  const guess = {
    lat: selectedLatLng.lat,
    lng: selectedLatLng.lng,
    submittedAt: Date.now(),
  };
  elements.lockGuessButton.disabled = true;
  elements.lockGuessButton.textContent = "Guess locked";
  const distance = calculateDistanceMeters(guess, game.currentLocation);
  const payload = {
    playerId: localPlayer.playerId,
    guess,
    distance,
  };
  if (localPlayer.isHost) {
    registerGuess(localPlayer.playerId, payload);
    network.broadcast("PLAYER_GUESS", {
      playerId: localPlayer.playerId,
      distance,
    });
  } else {
    network.sendToHost("SUBMIT_GUESS", payload);
  }
  elements.feedback.textContent = `Guess submitted! ~${Math.round(distance)}m away.`;
}

function registerGuess(playerId, payload) {
  game.guesses.set(playerId, {
    ...payload,
    distance: payload.distance,
  });
  const player = players.get(playerId);
  if (player) {
    player.lastDistance = payload.distance;
  }
  updateScoreboard();
  if (game.guesses.size >= players.size || Date.now() >= game.timerDeadline) {
    finalizeRound();
  }
}

function finalizeRound() {
  if (!localPlayer.isHost) return;
  clearInterval(game.timerInterval);
  elements.timerDisplay.textContent = "00:00";
  players.forEach((player) => {
    if (!game.guesses.has(player.playerId)) {
      const target = game.currentLocation;
      const distance = target ? calculateDistanceMeters({ lat: target.lat, lng: target.lng }, target) : 0;
      game.guesses.set(player.playerId, {
        playerId: player.playerId,
        guess: null,
        distance: Infinity,
      });
      player.lastDistance = Infinity;
    }
  });
  const results = [];
  players.forEach((player) => {
    const guess = game.guesses.get(player.playerId);
    const distance = guess?.distance ?? Infinity;
    const scoreGain = Math.max(0, Math.round(5000 - distance / 30));
    player.score = (player.score || 0) + scoreGain;
    player.totalDistance = (player.totalDistance || 0) + distance;
    player.lastDistance = distance;
    results.push({ playerId: player.playerId, distance, scoreGain });
    if (game.ranked) {
      const perfect = distance <= GAME_CONSTANTS.rankedPerfectThresholdMeters;
      const chain = bumpPerfectChain(state, player.playerId, perfect);
      if (perfect && chain >= GAME_CONSTANTS.rankedPerfectChainLimit) {
        if (player.playerId === localPlayer.playerId) {
          flagRankedTimeout(state);
          updateBanNotice();
          showToast("Auto-mod timed you out of ranked for 24h.");
        } else {
          network.sendToPlayer(player.playerId, "RANKED_TIMEOUT", {
            reason: "Suspiciously precise streak",
            until: Date.now() + GAME_CONSTANTS.rankedTimeoutMs,
          });
        }
      }
    }
  });
  updateScoreboard();
  network.broadcast("ROUND_RESULTS", {
    round: game.round,
    location: {
      id: game.currentLocation.id,
      name: game.currentLocation.name,
      lat: game.currentLocation.lat,
      lng: game.currentLocation.lng,
      country: game.currentLocation.country,
    },
    results,
  });
  presentRoundSummary(results);
  if (game.round >= game.totalRounds) {
    concludeMatch();
  } else {
    elements.revealButton.disabled = false;
    elements.revealButton.textContent = "Next round";
  }
  saveState(state);
}

function presentRoundSummary(results) {
  const winner = [...results].sort((a, b) => a.distance - b.distance)[0];
  if (!winner) return;
  const player = players.get(winner.playerId);
  if (!player) return;
  elements.feedback.textContent = `${player.username} was closest this round (${Math.round(
    winner.distance
  )} m)!`;
  const marker = L.circle([game.currentLocation.lat, game.currentLocation.lng], {
    radius: 50,
    color: "#76f7ff",
    fillColor: "#76f7ff",
    fillOpacity: 0.3,
  });
  marker.addTo(map);
  setTimeout(() => map.removeLayer(marker), GAME_CONSTANTS.revealDelaySeconds * 1000);
}

function concludeMatch() {
  const standings = [...players.values()].sort((a, b) => b.score - a.score);
  const winner = standings[0];
  if (winner) {
    elements.gameStatus.textContent = `${winner.username} wins the match!`;
    appendChatMessage({
      system: true,
      message: `${winner.username} wins the match with ${winner.score} points!`,
    });
    const won = winner.playerId === localPlayer.playerId;
    const coinsEarned = won ? 120 : 40;
    recordMatchOutcome(state, {
      won,
      ranked: game.ranked,
      coinsEarned,
      summary: won
        ? `Won the match with ${winner.score} points`
        : `${winner.username} took the win with ${winner.score} points`,
    });
  }
  network.broadcast("MATCH_COMPLETE", {
    standings: standings.map((player) => ({
      playerId: player.playerId,
      score: player.score,
    })),
  });
  elements.revealButton.disabled = false;
  elements.revealButton.textContent = "Restart";
  game.started = false;
  saveState(state);
  updateProfileUI();
}

function renderReports() {
  elements.reportsList.innerHTML = "";
  if (!state.reports.length) {
    const empty = document.createElement("p");
    empty.textContent = "No reports yet.";
    empty.style.color = "var(--text-secondary)";
    elements.reportsList.appendChild(empty);
    return;
  }
  state.reports.forEach((report) => {
    const card = document.createElement("div");
    card.className = "report-card";
    const title = document.createElement("h4");
    title.textContent = `${report.targetName}`;
    const reason = document.createElement("span");
    reason.className = "badge";
    reason.textContent = report.reason;
    card.appendChild(title);
    card.appendChild(reason);
    const reporter = document.createElement("p");
    reporter.textContent = `Reported by ${report.reporterName}`;
    card.appendChild(reporter);
    if (report.details) {
      const details = document.createElement("p");
      details.textContent = report.details;
      card.appendChild(details);
    }
    const timestamp = document.createElement("p");
    timestamp.textContent = new Date(report.timestamp).toLocaleString();
    card.appendChild(timestamp);
    elements.reportsList.appendChild(card);
  });
}

function openStore() {
  renderStore();
  openModal(elements.storeModal);
}

function openProfileModal() {
  renderProfileModal();
  openModal(elements.profileModal);
}

function openReports() {
  renderReports();
  openModal(elements.reportsModal);
}

function updateBanNotice() {
  if (canUseRanked(state)) {
    elements.banNotice.classList.add("hidden");
    elements.rankedToggle.disabled = false;
  } else {
    const until = new Date(state.restrictions.rankedBanUntil).toLocaleString();
    elements.banNotice.textContent = `Auto-mod timeout active until ${until}`;
    elements.banNotice.classList.remove("hidden");
    elements.rankedToggle.checked = false;
    elements.rankedToggle.disabled = true;
  }
}

function ensureProfileValid() {
  const sanitized = sanitizeName(state.profile.username);
  if (!sanitized) {
    openProfileModal();
    elements.usernameWarning.textContent = "Choose a display name without profanity.";
  }
}

function systemMessage(text) {
  appendChatMessage({ system: true, message: text });
}

function handleReportSubmission() {
  if (!pendingReportTarget) return;
  const reasonInput = elements.reportPlayerModal.querySelector("input[name='reportReason']:checked");
  const report = {
    targetId: pendingReportTarget.playerId,
    targetName: pendingReportTarget.username,
    reporterId: localPlayer.playerId,
    reporterName: localPlayer.username,
    reason: reasonInput?.value || "other",
    details: elements.reportDetails.value.trim(),
    timestamp: new Date().toISOString(),
  };
  if (localPlayer.isHost) {
    pushReport(state, report);
    saveState(state);
    renderReports();
    showToast("Report stored for review.");
  } else {
    network.sendToHost("REPORT_SUBMIT", report);
    showToast("Report sent to host.");
  }
  closeModal(elements.reportPlayerModal);
}

function attachEventListeners() {
  elements.createRoomButton.addEventListener("click", async () => {
    const code = generateRoomCode();
    try {
      await network.host(code);
      localPlayer.isHost = true;
      localPlayer.playerId = network.peerId;
      game.ranked = !!elements.rankedToggle.checked;
      players.clear();
      players.set(localPlayer.playerId, { ...localPlayer, score: 0, totalDistance: 0 });
      updateConnectionStatus(true);
      updateLobbyPlayers();
      resetGame();
      elements.revealButton.disabled = false;
      elements.revealButton.textContent = "Start match";
      systemMessage(`Room created. Share code ${code.toUpperCase()} with friends.`);
      elements.roomCodeInput.value = code.toUpperCase();
      network.broadcast("HOST_STATE", {
        code,
        ranked: game.ranked,
      });
    } catch (err) {
      console.error(err);
      showToast("Unable to create room. Try again.");
    }
  });

  elements.joinRoomButton.addEventListener("click", async () => {
    const input = elements.roomCodeInput.value.trim().toLowerCase();
    if (!input || input.length < 4) {
      showToast("Enter a valid room code.");
      return;
    }
    try {
      await network.join(input);
      localPlayer.isHost = false;
      localPlayer.playerId = network.peerId;
      updateConnectionStatus(true);
      network.sendToHost("JOIN_REQUEST", {
        profile: {
          username: state.profile.username,
          avatar: state.profile.avatar,
          decoration: state.profile.decoration,
        },
      });
    } catch (err) {
      console.error(err);
      showToast("Unable to join room.");
    }
  });

  elements.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = elements.chatInput.value.trim();
    if (!message) return;
    elements.chatInput.value = "";
    if (localPlayer.isHost) {
      appendChatMessage({ author: localPlayer.username, message });
      network.broadcast("CHAT_MESSAGE", {
        author: localPlayer.username,
        message,
      });
    } else {
      network.sendToHost("CHAT_MESSAGE", {
        author: localPlayer.username,
        message,
      });
    }
  });

  elements.hintButton.addEventListener("click", () => {
    if (!game.currentLocation) return;
    elements.feedback.textContent = game.currentLocation.hint;
    elements.hintButton.disabled = true;
  });

  elements.lockGuessButton.addEventListener("click", handleLocalGuess);
  elements.centerButton.addEventListener("click", () => {
    map.setView([20, 0], 2);
  });
  elements.revealButton.addEventListener("click", () => {
    if (!localPlayer.isHost) return;
    if (!game.started) {
      players.forEach((player) => {
        player.score = 0;
        player.totalDistance = 0;
        player.lastDistance = null;
      });
      const location = rollLocation();
      startRound(location);
      network.broadcast("ROUND_START", {
        round: game.round,
        totalRounds: game.totalRounds,
        location: {
          id: location.id,
          image: location.image,
          clue: location.clue,
          hint: location.hint,
        },
        timerSeconds: GAME_CONSTANTS.guessTimerSeconds,
      });
    } else if (game.round >= game.totalRounds) {
      resetGame();
      network.broadcast("MATCH_RESET", {});
    } else {
      const location = rollLocation();
      startRound(location);
      network.broadcast("ROUND_START", {
        round: game.round,
        totalRounds: game.totalRounds,
        location: {
          id: location.id,
          image: location.image,
          clue: location.clue,
          hint: location.hint,
        },
        timerSeconds: GAME_CONSTANTS.guessTimerSeconds,
      });
    }
  });

  elements.storeButton.addEventListener("click", openStore);
  elements.closeStoreButton.addEventListener("click", () => closeModal(elements.storeModal));
  elements.profileButton.addEventListener("click", openProfileModal);
  elements.reportsButton.addEventListener("click", () => {
    if (!localPlayer.isHost) {
      showToast("Reports are accessible only to the host.");
      return;
    }
    openReports();
  });
  elements.closeReportsButton.addEventListener("click", () => closeModal(elements.reportsModal));
  elements.clearReportsButton.addEventListener("click", () => {
    storeReports(state, []);
    saveState(state);
    renderReports();
  });
  elements.exportReportsButton.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.reports, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `atlasquest-reports-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });

  elements.profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const sanitized = sanitizeName(elements.usernameInput.value);
    if (!sanitized) {
      elements.usernameWarning.textContent = "Names must be 3-16 characters without slurs.";
      return;
    }
    state.profile.username = sanitized;
    elements.usernameWarning.textContent = "";
    saveState(state);
    updateProfileUI();
    closeModal(elements.profileModal);
    if (localPlayer.playerId) {
      players.set(localPlayer.playerId, {
        ...(players.get(localPlayer.playerId) || {}),
        username: sanitized,
        avatar: state.profile.avatar,
        decoration: state.profile.decoration,
        playerId: localPlayer.playerId,
        isHost: localPlayer.isHost,
      });
      updateLobbyPlayers();
      updateScoreboard();
    }
  });

  elements.submitReportButton.addEventListener("click", handleReportSubmission);
  elements.cancelReportButton.addEventListener("click", () => closeModal(elements.reportPlayerModal));
}

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8);
}

function setupNetworkHandlers() {
  network.on("JOIN_REQUEST", ({ from, payload }) => {
    if (!localPlayer.isHost) return;
    const { profile } = payload;
    const nameOk = sanitizeName(profile.username);
    if (!nameOk) {
      network.sendToPlayer(from, "JOIN_DENIED", { reason: "Username blocked" });
      return;
    }
    const player = {
      playerId: from,
      username: profile.username,
      avatar: profile.avatar,
      decoration: profile.decoration,
      score: 0,
      totalDistance: 0,
      lastDistance: null,
    };
    players.set(from, player);
    updateLobbyPlayers();
    updateScoreboard();
    network.sendToPlayer(from, "JOIN_ACCEPTED", {
      playerId: from,
      ranked: game.ranked,
      host: {
        playerId: localPlayer.playerId,
        username: localPlayer.username,
      },
      players: Array.from(players.values()),
      round: game.round,
      totalRounds: game.totalRounds,
      started: game.started,
    });
    network.broadcast("PLAYER_JOINED", { player });
    appendChatMessage({ system: true, message: `${player.username} joined the lobby.` });
  });

  network.on("PLAYER_JOINED", ({ payload }) => {
    if (localPlayer.isHost) return;
    const { player } = payload;
    players.set(player.playerId, player);
    updateLobbyPlayers();
    updateScoreboard();
    appendChatMessage({ system: true, message: `${player.username} joined the lobby.` });
  });

  network.on("JOIN_ACCEPTED", ({ payload }) => {
    if (localPlayer.isHost) return;
    players.clear();
    payload.players.forEach((player) => {
      players.set(player.playerId, player);
    });
    localPlayer.playerId = payload.playerId;
    players.set(payload.playerId, {
      ...(players.get(payload.playerId) || {}),
      playerId: payload.playerId,
      username: state.profile.username,
      avatar: state.profile.avatar,
      decoration: state.profile.decoration,
    });
    game.ranked = payload.ranked;
    updateLobbyPlayers();
    updateScoreboard();
    appendChatMessage({ system: true, message: "Connected to host." });
  });

  network.on("JOIN_DENIED", ({ payload }) => {
    showToast(payload.reason || "Unable to join");
    network.close();
    updateConnectionStatus(false);
  });

  network.on("PLAYER_REMOVED", ({ payload }) => {
    const removed = players.get(payload.playerId);
    players.delete(payload.playerId);
    updateLobbyPlayers();
    updateScoreboard();
    if (removed) {
      appendChatMessage({ system: true, message: `${removed.username} was removed.` });
    }
  });

  network.on("CHAT_MESSAGE", ({ payload }) => {
    appendChatMessage(payload);
  });

  network.on("PLAYER_GUESS", ({ payload }) => {
    const player = players.get(payload.playerId);
    if (player) {
      player.lastDistance = payload.distance;
      updateScoreboard();
    }
  });

  network.on("ROUND_START", ({ payload }) => {
    game.round = payload.round;
    game.totalRounds = payload.totalRounds;
    game.currentLocation = payload.location;
    game.started = true;
    game.guesses.clear();
    if (payload.round === 1) {
      players.forEach((player) => {
        player.score = 0;
        player.totalDistance = 0;
        player.lastDistance = null;
      });
    }
    elements.roundCounter.textContent = `Round ${payload.round} / ${payload.totalRounds}`;
    elements.sceneImage.src = payload.location.image;
    elements.sceneOverlay.classList.add("hidden");
    elements.clueText.textContent = payload.location.clue;
    elements.hintButton.disabled = false;
    elements.lockGuessButton.disabled = false;
    elements.lockGuessButton.textContent = "Lock guess";
    elements.revealButton.disabled = true;
    elements.feedback.textContent = "Place your marker and lock in!";
    elements.timerDisplay.textContent = formatTimer(payload.timerSeconds);
    clearInterval(game.timerInterval);
    game.timerDeadline = Date.now() + payload.timerSeconds * 1000;
    game.timerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((game.timerDeadline - Date.now()) / 1000));
      elements.timerDisplay.textContent = formatTimer(remaining);
      if (remaining <= 0) {
        clearInterval(game.timerInterval);
      }
    }, 500);
    if (guessMarker) {
      map.removeLayer(guessMarker);
      guessMarker = null;
    }
    selectedLatLng = null;
  });

  network.on("ROUND_RESULTS", ({ payload }) => {
    payload.results.forEach((result) => {
      const player = players.get(result.playerId);
      if (player) {
        player.score = (player.score || 0) + result.scoreGain;
        player.lastDistance = result.distance;
      }
    });
    updateScoreboard();
    elements.feedback.textContent = "Round complete!";
  });

  network.on("MATCH_COMPLETE", ({ payload }) => {
    const winnerId = payload.standings?.[0]?.playerId;
    const winner = winnerId ? players.get(winnerId) : null;
    if (winner) {
      elements.gameStatus.textContent = `${winner.username} wins the match!`;
    }
    elements.revealButton.disabled = false;
    elements.revealButton.textContent = "Restart";
    if (!localPlayer.isHost) {
      const won = winnerId === localPlayer.playerId;
      const coinsEarned = won ? 120 : 40;
      recordMatchOutcome(state, {
        won,
        ranked: game.ranked,
        coinsEarned,
        summary: won
          ? `Won the match with ${winner?.score || 0} points`
          : `${winner?.username || "Opponent"} took the win`,
      });
      saveState(state);
      updateProfileUI();
    }
  });

  network.on("MATCH_RESET", () => {
    resetGame();
  });

  network.on("SUBMIT_GUESS", ({ from, payload }) => {
    if (!localPlayer.isHost) return;
    registerGuess(from, payload);
  });

  network.on("REPORT_SUBMIT", ({ payload }) => {
    if (!localPlayer.isHost) return;
    pushReport(state, payload);
    saveState(state);
    renderReports();
    network.sendToPlayer(payload.reporterId, "REPORT_ACK", {});
  });

  network.on("REPORT_ACK", () => {
    showToast("Report received by host.");
  });

  network.on("RANKED_TIMEOUT", ({ payload }) => {
    if (payload?.until) {
      state.restrictions.rankedBanUntil = payload.until;
    } else {
      flagRankedTimeout(state);
    }
    saveState(state);
    updateBanNotice();
    showToast("Auto-mod timed you out of ranked for 24h.");
  });

  network.on("disconnect", ({ remotePeerId }) => {
    const removed = players.get(remotePeerId);
    players.delete(remotePeerId);
    updateLobbyPlayers();
    updateScoreboard();
    if (localPlayer.isHost) {
      network.broadcast("PLAYER_REMOVED", { playerId: remotePeerId });
      if (removed) {
        appendChatMessage({ system: true, message: `${removed.username} disconnected.` });
      }
    } else if (remotePeerId === network.hostId) {
      appendChatMessage({ system: true, message: "Lost connection to host." });
      updateConnectionStatus(false);
    } else if (removed) {
      appendChatMessage({ system: true, message: `${removed.username} left the lobby.` });
    }
  });

  network.on("error", (err) => {
    console.error("Network error", err);
    showToast("Network error occurred.");
  });
}

function bootstrap() {
  updateConnectionStatus(false);
  updateProfileUI();
  renderProfileModal();
  updateBanNotice();
  ensureProfileValid();
  initMap();
  attachEventListeners();
  setupNetworkHandlers();
}

bootstrap();
