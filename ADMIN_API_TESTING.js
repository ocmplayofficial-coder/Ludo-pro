/**
 * 🔐 ADMIN API ENDPOINTS - TESTING GUIDE
 * Base URL: http://localhost:5001/api/admin
 * 
 * 📝 All endpoints require authentication via Bearer token in Authorization header
 * Authorization: Bearer {JWT_TOKEN}
 */

// ============================================
// 📊 ANALYTICS ENDPOINTS
// ============================================

/**
 * GET /api/admin/analytics/revenue
 * Description: Get platform revenue analytics
 * Query Params: period (day, week, month, year)
 * Response: { totalRevenue, platformFee, gameRevenue[], transactionCount }
 */
const testRevenueAnalytics = {
  method: "GET",
  url: "http://localhost:5001/api/admin/analytics/revenue?period=month",
  headers: {
    "Authorization": "Bearer YOUR_JWT_TOKEN"
  }
};

/**
 * GET /api/admin/analytics/profit
 * Description: Get platform profit analytics
 * Response: { totalDeposits, totalWithdrawals, platformFees, totalWinnings, netProfit }
 */
const testProfitAnalytics = {
  method: "GET",
  url: "http://localhost:5001/api/admin/analytics/profit",
  headers: {
    "Authorization": "Bearer YOUR_JWT_TOKEN"
  }
};

/**
 * GET /api/admin/analytics/leaderboard
 * Description: Get top players leaderboard
 * Query Params: gameType (ludo, teenpatti), limit (default: 10)
 * Response: { leaderboard[] with gameId, winner, prizeWon, gameType }
 */
const testLeaderboard = {
  method: "GET",
  url: "http://localhost:5001/api/admin/analytics/leaderboard?gameType=ludo&limit=10",
  headers: {
    "Authorization": "Bearer YOUR_JWT_TOKEN"
  }
};

// ============================================
// 💰 TRANSACTION ENDPOINTS
// ============================================

/**
 * POST /api/admin/transaction/update
 * Description: Update transaction status/amount
 * Body: { transactionId, status, amount }
 * Response: { success, transaction }
 */
const testUpdateTransaction = {
  method: "POST",
  url: "http://localhost:5001/api/admin/transaction/update",
  headers: {
    "Authorization": "Bearer YOUR_JWT_TOKEN",
    "Content-Type": "application/json"
  },
  body: {
    transactionId: "TRANSACTION_ID_HERE",
    status: "completed",
    amount: 100
  }
};

// ============================================
// 👥 USER MANAGEMENT ENDPOINTS
// ============================================

/**
 * GET /api/admin/users
 * Description: Get all users with pagination
 * Query Params: page (default: 1), limit (default: 20), search (optional)
 * Response: { users[], total, pages }
 */
const testGetAllUsers = {
  method: "GET",
  url: "http://localhost:5001/api/admin/users?page=1&limit=20&search=john",
  headers: {
    "Authorization": "Bearer YOUR_JWT_TOKEN"
  }
};

/**
 * POST /api/admin/wallet/update
 * Description: Update user wallet balance
 * Body: { userId, amount, type: "add"|"subtract"|"set" }
 * Response: { success, message, user }
 */
const testUpdateUserWallet = {
  method: "POST",
  url: "http://localhost:5001/api/admin/wallet/update",
  headers: {
    "Authorization": "Bearer YOUR_JWT_TOKEN",
    "Content-Type": "application/json"
  },
  body: {
    userId: "USER_ID_HERE",
    amount: 500,
    type: "add" // or "subtract" or "set"
  }
};

/**
 * POST /api/admin/user/ban
 * Description: Ban/block a user
 * Body: { userId, reason (optional) }
 * Response: { success, message, user }
 */
const testBanUser = {
  method: "POST",
  url: "http://localhost:5001/api/admin/user/ban",
  headers: {
    "Authorization": "Bearer YOUR_JWT_TOKEN",
    "Content-Type": "application/json"
  },
  body: {
    userId: "USER_ID_HERE",
    reason: "Suspicious activity detected"
  }
};

// ============================================
// 🎮 GAME MANAGEMENT ENDPOINTS
// ============================================

/**
 * GET /api/admin/games
 * Description: Get all games with filtering
 * Query Params: page, limit, status (playing|finished|cancelled), gameType
 * Response: { games[], total, pages }
 */
const testGetAllGames = {
  method: "GET",
  url: "http://localhost:5001/api/admin/games?page=1&limit=20&status=finished&gameType=ludo",
  headers: {
    "Authorization": "Bearer YOUR_JWT_TOKEN"
  }
};

/**
 * POST /api/admin/game/end
 * Description: Force end a game
 * Body: { gameId, winnerId (optional) }
 * Response: { success, message, game }
 */
const testEndGame = {
  method: "POST",
  url: "http://localhost:5001/api/admin/game/end",
  headers: {
    "Authorization": "Bearer YOUR_JWT_TOKEN",
    "Content-Type": "application/json"
  },
  body: {
    gameId: "GAME_ID_HERE",
    winnerId: "USER_ID_HERE" // optional
  }
};

/**
 * POST /api/admin/game/delete
 * Description: Delete a game record
 * Body: { gameId }
 * Response: { success, message, gameId }
 */
const testDeleteGame = {
  method: "POST",
  url: "http://localhost:5001/api/admin/game/delete",
  headers: {
    "Authorization": "Bearer YOUR_JWT_TOKEN",
    "Content-Type": "application/json"
  },
  body: {
    gameId: "GAME_ID_HERE"
  }
};

// ============================================
// 🧪 CURL COMMANDS FOR TESTING
// ============================================

/*
# 1. Get Revenue Analytics
curl -X GET "http://localhost:5001/api/admin/analytics/revenue?period=month" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 2. Get Profit Analytics
curl -X GET "http://localhost:5001/api/admin/analytics/profit" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 3. Get Leaderboard
curl -X GET "http://localhost:5001/api/admin/analytics/leaderboard?gameType=ludo&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 4. Get All Users
curl -X GET "http://localhost:5001/api/admin/users?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 5. Update User Wallet
curl -X POST "http://localhost:5001/api/admin/wallet/update" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID_HERE",
    "amount": 500,
    "type": "add"
  }'

# 6. Ban User
curl -X POST "http://localhost:5001/api/admin/user/ban" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID_HERE",
    "reason": "Suspicious activity"
  }'

# 7. Get All Games
curl -X GET "http://localhost:5001/api/admin/games?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 8. End Game
curl -X POST "http://localhost:5001/api/admin/game/end" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "GAME_ID_HERE"
  }'

# 9. Delete Game
curl -X POST "http://localhost:5001/api/admin/game/delete" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "GAME_ID_HERE"
  }'

# 10. Update Transaction
curl -X POST "http://localhost:5001/api/admin/transaction/update" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "TRANSACTION_ID_HERE",
    "status": "completed",
    "amount": 100
  }'
*/

// ============================================
// 📌 POSTMAN COLLECTION FORMAT
// ============================================

const postmanCollection = {
  info: {
    name: "Admin API Endpoints",
    description: "Complete admin API testing collection",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  auth: {
    type: "bearer",
    bearer: [{key: "token", value: "YOUR_JWT_TOKEN"}]
  },
  item: [
    {
      name: "📊 Analytics",
      item: [
        {
          name: "Revenue Analytics",
          request: {
            method: "GET",
            url: "http://localhost:5001/api/admin/analytics/revenue?period=month"
          }
        },
        {
          name: "Profit Analytics",
          request: {
            method: "GET",
            url: "http://localhost:5001/api/admin/analytics/profit"
          }
        },
        {
          name: "Leaderboard",
          request: {
            method: "GET",
            url: "http://localhost:5001/api/admin/analytics/leaderboard?gameType=ludo&limit=10"
          }
        }
      ]
    },
    {
      name: "💰 Transactions",
      item: [
        {
          name: "Update Transaction",
          request: {
            method: "POST",
            url: "http://localhost:5001/api/admin/transaction/update",
            body: {
              transactionId: "...",
              status: "completed",
              amount: 100
            }
          }
        }
      ]
    },
    {
      name: "👥 Users",
      item: [
        {
          name: "Get All Users",
          request: {
            method: "GET",
            url: "http://localhost:5001/api/admin/users?page=1&limit=20"
          }
        },
        {
          name: "Update Wallet",
          request: {
            method: "POST",
            url: "http://localhost:5001/api/admin/wallet/update",
            body: {
              userId: "...",
              amount: 500,
              type: "add"
            }
          }
        },
        {
          name: "Ban User",
          request: {
            method: "POST",
            url: "http://localhost:5001/api/admin/user/ban",
            body: {
              userId: "...",
              reason: "Suspicious activity"
            }
          }
        }
      ]
    },
    {
      name: "🎮 Games",
      item: [
        {
          name: "Get All Games",
          request: {
            method: "GET",
            url: "http://localhost:5001/api/admin/games?page=1&limit=20"
          }
        },
        {
          name: "End Game",
          request: {
            method: "POST",
            url: "http://localhost:5001/api/admin/game/end",
            body: {
              gameId: "..."
            }
          }
        },
        {
          name: "Delete Game",
          request: {
            method: "POST",
            url: "http://localhost:5001/api/admin/game/delete",
            body: {
              gameId: "..."
            }
          }
        }
      ]
    }
  ]
};
