// Hand Rankings Evaluator
// 6: Trail (Trio)
// 5: Pure Sequence (Straight Flush)
// 4: Sequence (Straight)
// 3: Color (Flush)
// 2: Pair
// 1: High Card

export function evaluateTeenPattiHand(rawCards, variant) {
  let cards = [...rawCards].sort((a, b) => b.rank - a.rank);

  // AK47 Variant Wildcards Transformation logic: Aces, Kings, 4s, 7s act as wild cards
  if (variant === 'AK47') {
    const wildCount = cards.filter(c => ['A', 'K', '4', '7'].includes(c.value)).length;
    if (wildCount === 3) {
      return { title: "🎁 AK-47 Royal Trail!", strength: 6, tiebreaker: 14 * 1000 };
    }
    if (wildCount === 2) {
      // Best possible hand with 2 wildcards is a Trail of the remaining card
      const normalCard = cards.find(c => !['A', 'K', '4', '7'].includes(c.value)) || { rank: 14 };
      return { title: `🔥 Trail of ${normalCard.value || 'A'}s!`, strength: 6, tiebreaker: normalCard.rank * 1000 };
    }
    if (wildCount === 1) {
      // 1 wildcard can morph to make a Trail with a normal Pair, or Pure Sequence
      const normalCards = cards.filter(c => !['A', 'K', '4', '7'].includes(c.value));
      if (normalCards[0].rank === normalCards[1].rank) {
        return { title: `🔥 Trail of ${normalCards[0].value}s!`, strength: 6, tiebreaker: normalCards[0].rank * 1000 };
      }
      // Check for Pure Sequence (diff is 1 or 2)
      const diff = Math.abs(normalCards[0].rank - normalCards[1].rank);
      if (diff === 1 || diff === 2) {
        const highVal = Math.max(normalCards[0].rank, normalCards[1].rank) + (diff === 2 ? -1 : 1);
        return { title: "🌈 Pure Sequence", strength: 5, tiebreaker: highVal * 100 };
      }
      // Else make a Pair
      return { title: `✨ Pair of ${normalCards[0].value}s`, strength: 2, tiebreaker: normalCards[0].rank * 10 };
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
    // Invert the tiebreaker and strength logic
    // Strength is inverted: High card (1) becomes highest strength (6), Trail (6) becomes lowest strength (1)
    const originalStrength = strength;
    strength = 7 - originalStrength;
    tiebreaker = 10000 - tiebreaker; // Lowest card tiebreaker yields highest value
    title = `📉 Muflis (${title})`;
  }

  return { title, strength, tiebreaker };
}

export function compareHands(handA, handB, variant) {
  const evalA = evaluateTeenPattiHand(handA, variant);
  const evalB = evaluateTeenPattiHand(handB, variant);

  if (evalA.strength !== evalB.strength) {
    return evalA.strength > evalB.strength ? 'player' : 'bot';
  }
  return evalA.tiebreaker >= evalB.tiebreaker ? 'player' : 'bot';
}
