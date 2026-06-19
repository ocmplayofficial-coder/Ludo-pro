// Hand Rankings Evaluator
// 6: Trail (Trio)
// 5: Pure Sequence (Straight Flush)
// 4: Sequence (Straight)
// 3: Color (Flush)
// 2: Pair
// 1: High Card

export function evaluateTeenPattiHand(rawCards, variant, jokerValue = null) {
  if (!rawCards || rawCards.length !== 3) {
    return { title: "Invalid Hand", strength: 0, tiebreaker: 0 };
  }

  let cards = [...rawCards].sort((a, b) => b.rank - a.rank);

  // Joker wildcards logic: jokerValue acts as a wild card
  if (variant === 'JOKER' && jokerValue) {
    const wildCount = cards.filter(c => c.value === jokerValue).length;
    if (wildCount === 3) {
      return { title: "🎁 Joker Royal Trail!", strength: 6, tiebreaker: 14 * 1000 };
    }
    if (wildCount === 2) {
      // Best possible hand with 2 wildcards is a Trail of the remaining card
      const normalCard = cards.find(c => c.value !== jokerValue) || { rank: 14, value: 'A' };
      return { title: `🔥 Trail of ${normalCard.value}s!`, strength: 6, tiebreaker: normalCard.rank * 1000 };
    }
    if (wildCount === 1) {
      // 1 wildcard can morph to make a Trail with a normal Pair, or sequence/flush
      const normalCards = cards.filter(c => c.value !== jokerValue);
      if (normalCards[0].rank === normalCards[1].rank) {
        return { title: `🔥 Trail of ${normalCards[0].value}s!`, strength: 6, tiebreaker: normalCards[0].rank * 1000 };
      }
      
      const diff = Math.abs(normalCards[0].rank - normalCards[1].rank);
      const sameSuit = normalCards[0].suit === normalCards[1].suit;

      if (diff === 1 || diff === 2) {
        // Can form sequence (straight)
        const highRank = Math.max(normalCards[0].rank, normalCards[1].rank) + (diff === 2 ? -1 : 1);
        if (sameSuit) {
          return { title: "🌈 Pure Sequence!", strength: 5, tiebreaker: highRank * 500 };
        }
        return { title: "🏃 Sequence (Straight)", strength: 4, tiebreaker: highRank * 250 };
      }
      
      if (sameSuit) {
        return { title: "🎨 Color Flush", strength: 3, tiebreaker: normalCards[0].rank * 125 };
      }
      
      // Pair of the high card
      return { title: `✨ Pair of ${normalCards[0].value}s`, strength: 2, tiebreaker: normalCards[0].rank * 100 + normalCards[1].rank };
    }
  }

  // Classic Card Checks
  const isTrail = cards[0].rank === cards[1].rank && cards[1].rank === cards[2].rank;
  const isPureSeq = (cards[0].rank - cards[1].rank === 1 && cards[1].rank - cards[2].rank === 1) && 
                    (cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit);
  const isSeq = (cards[0].rank - cards[1].rank === 1 && cards[1].rank - cards[2].rank === 1);
  const isColor = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
  const isPair = cards[0].rank === cards[1].rank || cards[1].rank === cards[2].rank || cards[0].rank === cards[2].rank;

  let title = "High Card";
  let strength = 1;
  let tiebreaker = cards[0].rank * 100 + cards[1].rank * 10 + cards[2].rank;

  if (isTrail) {
    title = "🔥 Trio Trail!";
    strength = 6;
    tiebreaker = cards[0].rank * 1000;
  } else if (isPureSeq) {
    title = "🌈 Pure Sequence!";
    strength = 5;
    tiebreaker = cards[0].rank * 500;
  } else if (isSeq) {
    title = "🏃 Sequence (Straight)";
    strength = 4;
    tiebreaker = cards[0].rank * 250;
  } else if (isColor) {
    title = "🎨 Color Flush";
    strength = 3;
    tiebreaker = cards[0].rank * 125;
  } else if (isPair) {
    title = "✨ Pair Match";
    strength = 2;
    const pairRank = cards[0].rank === cards[1].rank ? cards[0].rank : cards[2].rank;
    const oddRank = cards[0].rank === cards[1].rank ? cards[2].rank : (cards[1].rank === cards[2].rank ? cards[0].rank : cards[1].rank);
    tiebreaker = pairRank * 100 + oddRank;
  }

  // Muflis Model: Lowest rank hand wins
  if (variant === 'MUFLIS') {
    // Invert strength and tiebreaker
    strength = 7 - strength;
    tiebreaker = 10000 - tiebreaker;
    title = `📉 Muflis (${title})`;
  }

  return { title, strength, tiebreaker };
}

export function compareHands(handA, handB, variant, jokerValue = null) {
  const evalA = evaluateTeenPattiHand(handA, variant, jokerValue);
  const evalB = evaluateTeenPattiHand(handB, variant, jokerValue);

  if (evalA.strength !== evalB.strength) {
    return evalA.strength > evalB.strength ? 'A' : 'B';
  }
  return evalA.tiebreaker >= evalB.tiebreaker ? 'A' : 'B';
}
