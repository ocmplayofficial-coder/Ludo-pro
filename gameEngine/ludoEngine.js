class LudoEngine {
  constructor() {
    this.BOARD_SIZE = 52;
    this.SAFE_POSITIONS = [1, 9, 14, 22, 27, 35, 40, 48];
    
    this.STARTING_POSITIONS = {
      red: 14,
      green: 27,
      yellow: 40,
      blue: 1,
    };
  }

  // 🔥 NEW: Added rollDice function (This was missing!)
  rollDice() {
    return Math.floor(Math.random() * 6) + 1;
  }

  // 1. 🏗️ CREATE TOKENS
  createTokens(gameType = "classic", color) {
    if (gameType !== "classic") {
      return Array.from({ length: 4 }, () => ({
        position: this.STARTING_POSITIONS[color],
        steps: 1,
        status: "active",
      }));
    }

    return Array.from({ length: 4 }, () => ({
      position: -1,
      steps: 0,
      status: "home",
    }));
  }

  // 2. 🚀 INITIALIZE GAME
  initializeGame(playerColors = ["red", "green"], gameType = "classic") {
    const colors = Array.isArray(playerColors) ? playerColors : [playerColors];
    const tokens = colors.reduce((acc, color) => {
      acc[color] = this.createTokens(gameType, color);
      return acc;
    }, {});

    const scores = colors.reduce((acc, color) => ({
      ...acc,
      [color]: 0
    }), {});

    const totalMoves = gameType === "turn" ? 25 : 0;

    const turnTimeLimit = gameType === "classic" ? 30 : 20;

    return {
      status: "playing",
      currentTurn: 0,
      diceValue: 0,
      turnStartTime: Date.now(),
      turnTimeLimit,
      totalMoves,
      tokens,
      playerOrder: colors,
      scores,
      winner: null
    };
  }

  // 🔥 NEW: Added getValidMoves for Socket validation
  getValidMoves(tokens, color, dice, gameType = "classic") {
    const moves = [];
    const playerTokens = tokens[color];
    
    playerTokens.forEach((token, index) => {
      if (this.canMove(token, dice, gameType)) {
        moves.push(index);
      }
    });
    return moves;
  }

  // 3. ✅ VALIDATE MOVE
  canMove(token, dice, gameType = "classic") {
    if (!token || token.status === "finished") return false;
    if (gameType === "classic") {
      if (token.status === "home" && dice !== 6) return false;
    } else {
      if (token.status === "home") return true;
    }
    if (token.steps + dice > 57) return false;
    return true;
  }

  // 4. 🛤️ MOVE LOGIC
  moveToken(token, dice, color, gameType = "classic") {
    if (token.status === "home") {
      if (gameType === "classic") {
        if (dice !== 6) return;
        token.status = "active";
        token.position = this.STARTING_POSITIONS[color];
        token.steps = 1;
        return;
      }
      token.status = "active";
      token.position = this.STARTING_POSITIONS[color];
      token.steps = 1;
    }

    token.steps += dice;
    
    if (token.steps === 57) {
      token.status = "finished";
      token.position = 99; 
      return;
    }

    if (token.steps > 51) {
      token.position = 100 + (token.steps - 51); 
    } else {
      token.position = ((this.STARTING_POSITIONS[color] + token.steps - 2) % 52) + 1;
    }
  }

  calculatePoints(game, color, dice, killedInfo, isVictory) {
    if (!['time', 'turn'].includes(game.type)) return;

    if (!game.gameState) game.gameState = {};
    if (!game.gameState.scores) game.gameState.scores = {};

    game.gameState.scores[color] = (game.gameState.scores[color] || 0) + dice;

    if (killedInfo?.color) {
      game.gameState.scores[color] += 20;
      const victimColor = killedInfo.color;
      game.gameState.scores[victimColor] = Math.max(
        0,
        (game.gameState.scores[victimColor] || 0) - 20
      );
    }

    if (isVictory) {
      game.gameState.scores[color] += 56;
    }
  }

  // 5. 🛡️ STACK CHECK
  isStackSafe(tokens, color, position) {
    if (this.SAFE_POSITIONS.includes(position)) return true;
    const count = tokens[color].filter(t => t.position === position && t.status === "active").length;
    return count > 1;
  }

  // 6. 💥 KILL LOGIC
  checkKill(attackerColor, position, allTokens, gameType = "classic") {
    if (this.SAFE_POSITIONS.includes(position)) return null;

    let killedInfo = null;
    for (const color in allTokens) {
      if (color === attackerColor) continue;
      if (this.isStackSafe(allTokens, color, position)) continue;

      allTokens[color].forEach((t, index) => {
        if (t.position === position && t.status === "active") {
          if (gameType !== "classic") {
            t.position = this.STARTING_POSITIONS[color];
            t.steps = 1;
            t.status = "active";
          } else {
            t.position = -1;
            t.steps = 0;
            t.status = "home";
          }
          killedInfo = { color, index };
        }
      });
    }
    return killedInfo;
  }

  // 7. 🎯 PROCESS MOVE
  processMove(game, color, tokenIndex, dice) {
    const token = game.tokens[color][tokenIndex];

    if (!this.canMove(token, dice, game.type)) return { success: false };

    this.moveToken(token, dice, color, game.type);
    const killedInfo = this.checkKill(color, token.position, game.tokens, game.type);

    const isVictory = token.status === "finished";
    this.calculatePoints(game, color, dice, killedInfo, isVictory);

    const isWinner = game.tokens[color].every(t => t.status === "finished");
    if (isWinner) {
      game.status = "finished";
      game.winner = color;
    }

    return {
      success: true,
      killed: !!killedInfo,
      killedInfo,
      winner: game.winner,
      scores: game.gameState.scores,
      tokens: game.tokens
    };
  }

  // 8. 🔁 TURN LOGIC
  getNextTurn(currentTurn, totalPlayers, dice, killed) {
    if (dice === 6 || killed) return currentTurn;
    return (currentTurn + 1) % totalPlayers;
  }
}

// Export the instance
module.exports = new LudoEngine();