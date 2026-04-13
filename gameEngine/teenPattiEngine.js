class TeenPattiEngine {
  constructor() {
    this.suits = ["♠", "♥", "♦", "♣"];
    this.values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    this.rankMap = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14 };
    this.fullDeck = this.createFullDeck();
  }

  createFullDeck() {
    const deck = [];
    for (let suit of this.suits) {
      for (let value of this.values) {
        deck.push({ suit, value, rank: this.rankMap[value] });
      }
    }
    return deck;
  }

  /**
   * 🃏 Professional Shuffling (Fisher-Yates Algorithm)
   */
  createDeck() {
    let deck = [...this.fullDeck];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  /**
   * 🃏 HAND SCORING LOGIC (Classic)
   */
  getHandScoreClassic(cards) {
    if (!cards || cards.length < 3) return 0;
    
    const ranks = cards.map(c => c.rank).sort((a, b) => a - b);
    const suits = cards.map(c => c.suit);
    
    const isFlush = suits[0] === suits[1] && suits[1] === suits[2];
    
    // A-2-3 is the highest sequence in many variations, A-K-Q is next
    const isSequence = (ranks[2] - ranks[1] === 1 && ranks[1] - ranks[0] === 1) || 
                       (ranks[0] === 2 && ranks[1] === 3 && ranks[2] === 14); // A-2-3

    // 1. Trail (Triple) - Score: 600 + Rank
    if (ranks[0] === ranks[2]) return 600 + ranks[0]; 

    // 2. Pure Sequence - Score: 500 + Rank
    if (isFlush && isSequence) return 500 + (ranks[0] === 2 && ranks[2] === 14 ? 15 : ranks[2]); 

    // 3. Sequence (Run) - Score: 400 + Rank
    if (isSequence) return 400 + (ranks[0] === 2 && ranks[2] === 14 ? 15 : ranks[2]); 

    // 4. Flush (Color) - Score: 300 + Rank
    if (isFlush) return 300 + ranks[2]; 

    // 5. Pair - Score: 200 + Rank
    if (ranks[0] === ranks[1] || ranks[1] === ranks[2]) return 200 + ranks[1]; 

    // 6. High Card - Score: 100 + Rank
    return 100 + ranks[2]; 
  }

  /**
   * 💣 AK47 VARIATION LOGIC
   */
  getHandScoreAk47(cards) {
    const isWildcard = (c) => ["A", "K", "4", "7"].includes(c.value);
    const normalCards = cards.filter(c => !isWildcard(c));
    const wildCount = 3 - normalCards.length;

    if (wildCount === 0) return this.getHandScoreClassic(cards);
    if (wildCount === 3) return 600 + 14; // AAA Trail

    let bestScore = 0;
    // Check top tier replacements (A, K, Q, J, 10)
    const topValues = ["A", "K", "Q", "J", "10"];
    const replacements = this.fullDeck.filter(c => topValues.includes(c.value));

    if (wildCount === 1) {
      for (const r of replacements) {
        bestScore = Math.max(bestScore, this.getHandScoreClassic([...normalCards, r]));
      }
    } else if (wildCount === 2) {
      for (const r1 of replacements) {
        for (const r2 of replacements) {
          bestScore = Math.max(bestScore, this.getHandScoreClassic([...normalCards, r1, r2]));
        }
      }
    }
    return bestScore;
  }

  /**
   * 🏆 WINNER DETERMINATION
   */
  getWinner(players, potAmount, mode = 'CLASSIC', commissionRate = 0.10) {
    const activePlayers = players.filter((p) => !p.isPacked);
    if (activePlayers.length === 0) return null;

    let winnerPlayer = activePlayers[0];

    if (activePlayers.length > 1) {
      winnerPlayer = activePlayers.reduce((prev, curr) => {
        const pScore = this.getHandScore(prev.cards, mode);
        const cScore = this.getHandScore(curr.cards, mode);
        return cScore > pScore ? curr : prev;
      });
    }

    // 🔥 Platform Fee (Admin Profit)
    const platformFee = Math.floor(potAmount * (commissionRate / 100 || 0.10));
    const netPrize = potAmount - platformFee;

    return {
      winner: winnerPlayer,
      potAmount,
      platformFee,
      netPrize,
      mode
    };
  }

  getHandScore(cards, mode) {
    const m = String(mode || 'CLASSIC').toUpperCase();
    if (m === 'MUFLIS') return 1000 - this.getHandScoreClassic(cards); // Inverse logic for Muflis
    if (m === 'AK47') return this.getHandScoreAk47(cards);
    return this.getHandScoreClassic(cards);
  }
}

module.exports = new TeenPattiEngine();