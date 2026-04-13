# 🔐 Admin API Endpoints - Complete Reference

**Base URL:** `http://localhost:5001/api/admin`  
**Authentication:** All endpoints require Bearer token in Authorization header

---

## 📊 Analytics Endpoints

### 1. Revenue Analytics
```
GET /api/admin/analytics/revenue
```
**Query Parameters:**
- `period`: day, week, month, year (optional, default: month)

**Response Example:**
```json
{
  "success": true,
  "totalRevenue": 50000,
  "platformFee": 5000,
  "gameRevenue": [
    { "_id": "ludo", "revenue": 30000 },
    { "_id": "teenpatti", "revenue": 20000 }
  ],
  "transactionCount": 250
}
```

### 2. Profit Analytics
```
GET /api/admin/analytics/profit
```

**Response Example:**
```json
{
  "success": true,
  "totalDeposits": 100000,
  "totalWithdrawals": 45000,
  "platformFees": 8000,
  "totalWinnings": 60000,
  "netProfit": 3000
}
```

### 3. Leaderboard
```
GET /api/admin/analytics/leaderboard
```
**Query Parameters:**
- `gameType`: ludo, teenpatti (optional, default: ludo)
- `limit`: 1-100 (optional, default: 10)

**Response Example:**
```json
{
  "success": true,
  "leaderboard": [
    {
      "gameId": "507f1f77bcf86cd799439011",
      "winner": "507f1f77bcf86cd799439012",
      "prizeWon": 500,
      "gameType": "ludo",
      "createdAt": "2026-04-04T10:30:00Z"
    }
  ]
}
```

---

## 💰 Transaction Endpoints

### Update Transaction
```
POST /api/admin/transaction/update
```

**Request Body:**
```json
{
  "transactionId": "507f1f77bcf86cd799439011",
  "status": "completed",
  "amount": 100
}
```

**Response Example:**
```json
{
  "success": true,
  "transaction": {
    "_id": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439012",
    "type": "deposit",
    "amount": 100,
    "status": "completed",
    "platformFee": 10,
    "createdAt": "2026-04-04T10:30:00Z"
  }
}
```

---

## 👥 User Management Endpoints

### 1. Get All Users
```
GET /api/admin/users
```

**Query Parameters:**
- `page`: 1-N (optional, default: 1)
- `limit`: 1-100 (optional, default: 20)
- `search`: name or phone number (optional)

**Response Example:**
```json
{
  "success": true,
  "users": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "phone": "9876543210",
      "email": "john@example.com",
      "status": "active",
      "wallet": {
        "balance": 1000,
        "winnings": 500,
        "bonus": 100,
        "deposit": 1500
      },
      "createdAt": "2026-04-01T10:30:00Z"
    }
  ],
  "total": 150,
  "pages": 8
}
```

### 2. Update User Wallet
```
POST /api/admin/wallet/update
```

**Request Body:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "amount": 500,
  "type": "add"
}
```

**Type Options:**
- `add`: Add amount to current balance
- `subtract`: Deduct amount from balance
- `set`: Set balance to exact amount

**Response Example:**
```json
{
  "success": true,
  "message": "Wallet updated",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "wallet": {
      "balance": 1500,
      "winnings": 500,
      "bonus": 100,
      "deposit": 1500
    }
  }
}
```

### 3. Ban User
```
POST /api/admin/user/ban
```

**Request Body:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "reason": "Suspicious activity detected"
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "User banned",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "status": "blocked",
    "banReason": "Suspicious activity detected"
  }
}
```

---

## 🎮 Game Management Endpoints

### 1. Get All Games
```
GET /api/admin/games
```

**Query Parameters:**
- `page`: 1-N (optional, default: 1)
- `limit`: 1-100 (optional, default: 20)
- `status`: playing, finished, cancelled (optional)
- `gameType`: ludo, teenpatti (optional)

**Response Example:**
```json
{
  "success": true,
  "games": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "roomId": "ROOM_1712229000000",
      "type": "ludo",
      "status": "finished",
      "entryFee": 10,
      "prizeMoney": 20,
      "players": [
        {
          "userId": "507f1f77bcf86cd799439012",
          "name": "Player 1"
        },
        {
          "userId": "507f1f77bcf86cd799439013",
          "name": "Player 2"
        }
      ],
      "winner": "507f1f77bcf86cd799439012",
      "createdAt": "2026-04-04T10:30:00Z"
    }
  ],
  "total": 500,
  "pages": 25
}
```

### 2. End Game
```
POST /api/admin/game/end
```

**Request Body:**
```json
{
  "gameId": "507f1f77bcf86cd799439011",
  "winnerId": "507f1f77bcf86cd799439012"
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "Game ended",
  "game": {
    "_id": "507f1f77bcf86cd799439011",
    "status": "finished",
    "winner": "507f1f77bcf86cd799439012"
  }
}
```

### 3. Delete Game
```
POST /api/admin/game/delete
```

**Request Body:**
```json
{
  "gameId": "507f1f77bcf86cd799439011"
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "Game deleted",
  "gameId": "507f1f77bcf86cd799439011"
}
```

---

## 🧪 Testing Examples

### Using cURL

```bash
# Revenue Analytics
curl -X GET "http://localhost:5001/api/admin/analytics/revenue?period=month" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get Users
curl -X GET "http://localhost:5001/api/admin/users?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Add Money to Wallet
curl -X POST "http://localhost:5001/api/admin/wallet/update" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID",
    "amount": 500,
    "type": "add"
  }'

# Ban User
curl -X POST "http://localhost:5001/api/admin/user/ban" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID",
    "reason": "Suspicious activity"
  }'
```

### Using JavaScript/Fetch

```javascript
const token = "YOUR_JWT_TOKEN";

// Get Revenue
fetch('http://localhost:5001/api/admin/analytics/revenue?period=month', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(res => res.json())
.then(data => console.log(data));

// Update Wallet
fetch('http://localhost:5001/api/admin/wallet/update', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 'USER_ID',
    amount: 500,
    type: 'add'
  })
})
.then(res => res.json())
.then(data => console.log(data));
```

### Using Postman

1. Set base URL: `http://localhost:5001/api/admin`
2. Add Authorization header: `Bearer YOUR_JWT_TOKEN`
3. Import endpoints as documented above
4. Test each endpoint with provided examples

---

## ❌ Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "userId, amount, and type required"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "No token provided"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "User not found"
}
```

### 500 Server Error
```json
{
  "success": false,
  "message": "Error message here"
}
```

---

## 🔒 Authentication

All endpoints require a valid JWT token obtained from login:
```
POST /api/auth/login
```

Include token in all requests:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 📝 Notes

- All timestamps are in ISO 8601 format
- All monetary amounts are in rupees (₹)
- Pagination starts from page 1
- Default limit is 20 items per page
- Search is case-insensitive partial match
