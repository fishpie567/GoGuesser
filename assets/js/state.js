import { AVATARS, DECORATIONS, RANKS, GAME_CONSTANTS } from "../data/constants.js";

const STORAGE_KEY = "atlasquest-arena-state";

function getDefaultState() {
  return {
    profile: {
      username: "Rookie",
      avatar: AVATARS[0].id,
      decoration: DECORATIONS[0].id,
      coins: 200,
    },
    stats: {
      wins: 0,
      losses: 0,
      bestStreak: 0,
      currentStreak: 0,
    },
    cosmeticsOwned: {
      avatars: new Set([AVATARS[0].id]),
      decorations: new Set([DECORATIONS[0].id]),
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
      perfectChains: {},
    },
  };
}

export function loadState() {
  const defaults = getDefaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw);

    return {
      profile: {
        ...defaults.profile,
        ...(parsed.profile || {}),
      },
      stats: {
        ...defaults.stats,
        ...(parsed.stats || {}),
      },
      cosmeticsOwned: {
        avatars: new Set(parsed.cosmeticsOwned?.avatars || Array.from(defaults.cosmeticsOwned.avatars)),
        decorations: new Set(
          parsed.cosmeticsOwned?.decorations || Array.from(defaults.cosmeticsOwned.decorations)
        ),
      },
      rank: {
        ...defaults.rank,
        ...(parsed.rank || {}),
      },
      history: parsed.history || [],
      reports: parsed.reports || [],
      restrictions: {
        rankedBanUntil: parsed.restrictions?.rankedBanUntil || null,
        perfectChains: parsed.restrictions?.perfectChains || {},
      },
    };
  } catch (err) {
    console.error("Failed to parse stored state", err);
    return defaults;
  }
}

export function saveState(state) {
  const payload = {
    ...state,
    cosmeticsOwned: {
      avatars: Array.from(state.cosmeticsOwned.avatars),
      decorations: Array.from(state.cosmeticsOwned.decorations),
    },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function awardCoins(state, amount) {
  state.profile.coins = Math.max(0, Math.round((state.profile.coins || 0) + amount));
}

export function adjustRankOnWin(state) {
  const rank = state.rank;
  const structure = RANKS[rank.tierIndex] || RANKS[RANKS.length - 1];
  const winsNeeded = structure.winsRequired;
  if (structure.stages === 1) {
    return;
  }
  rank.progress += 1;
  if (rank.progress >= winsNeeded) {
    rank.progress = 0;
    if (rank.stage < structure.stages) {
      rank.stage += 1;
    } else if (rank.tierIndex < RANKS.length - 1) {
      rank.tierIndex += 1;
      rank.stage = 1;
    }
  }
}

export function adjustRankOnLoss(state) {
  const rank = state.rank;
  const structure = RANKS[rank.tierIndex] || RANKS[0];
  if (structure.stages === 1) {
    return;
  }
  if (rank.stage === 1 && rank.progress === 0) {
    return;
  }
  if (rank.progress > 0) {
    rank.progress = Math.max(0, rank.progress - 1);
  } else if (rank.stage > 1) {
    rank.stage -= 1;
    rank.progress = Math.max(0, structure.winsRequired - 1);
  }
}

export function recordMatchOutcome(state, { won, ranked, coinsEarned, summary }) {
  if (won) {
    state.stats.wins += 1;
    state.stats.currentStreak += 1;
    state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.currentStreak);
    if (ranked) {
      adjustRankOnWin(state);
    }
  } else {
    state.stats.losses += 1;
    state.stats.currentStreak = 0;
    if (ranked) {
      adjustRankOnLoss(state);
    }
  }
  awardCoins(state, coinsEarned);
  state.history.unshift({
    id: `${Date.now()}`,
    won,
    ranked,
    coins: coinsEarned,
    summary,
    timestamp: new Date().toISOString(),
  });
  state.history = state.history.slice(0, 30);
}

export function purchaseCosmetic(state, type, id) {
  const catalog = type === "avatar" ? AVATARS : DECORATIONS;
  const item = catalog.find((entry) => entry.id === id);
  if (!item) {
    throw new Error("Unknown cosmetic");
  }
  if (state.profile.coins < item.cost) {
    return false;
  }
  awardCoins(state, -item.cost);
  if (type === "avatar") {
    state.cosmeticsOwned.avatars.add(id);
  } else {
    state.cosmeticsOwned.decorations.add(id);
  }
  return true;
}

export function canUseRanked(state) {
  const bannedUntil = state.restrictions.rankedBanUntil;
  if (!bannedUntil) return true;
  const now = Date.now();
  if (now >= bannedUntil) {
    state.restrictions.rankedBanUntil = null;
    return true;
  }
  return false;
}

export function flagRankedTimeout(state) {
  state.restrictions.rankedBanUntil = Date.now() + GAME_CONSTANTS.rankedTimeoutMs;
}

export function bumpPerfectChain(state, playerId, isPerfect) {
  const chain = state.restrictions.perfectChains[playerId] || 0;
  state.restrictions.perfectChains[playerId] = isPerfect ? chain + 1 : 0;
  return state.restrictions.perfectChains[playerId];
}

export function storeReports(state, reports) {
  state.reports = reports;
}

export function pushReport(state, report) {
  state.reports.unshift(report);
  state.reports = state.reports.slice(0, 200);
}
