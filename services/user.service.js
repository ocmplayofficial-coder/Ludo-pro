import { db } from '../config/db.js';

export class UserService {
  static getProfile(user) {
    return user;
  }

  static async updateProfile(user, username, avatar, preferredColor) {
    let changed = false;
    
    if (username && username.trim() !== "") {
      user.username = username.trim();
      changed = true;
      if (!user.avatar && !avatar) {
        user.avatar = user.username[0].toUpperCase();
      }
    }
    
    if (avatar && avatar.trim() !== "") {
      user.avatar = avatar.trim();
      changed = true;
    }
    
    if (preferredColor && ['red', 'blue', 'green', 'yellow'].includes(preferredColor)) {
      user.preferredColor = preferredColor;
      changed = true;
    }
    
    if (changed) {
      try {
        console.log("Saving user profile with avatar:", user.avatar);
        if (typeof user.save === 'function') {
          return await user.save();
        }
      } catch (e) {
        console.error("Save error:", e);
      }
    }
    return user;
  }

  static getSupportMessages() {
    return db.supportMessages;
  }

  static addSupportMessage(user, text) {
    if (!text) {
      throw new Error("Message cannot be empty.");
    }

    const userMsg = {
      id: "U" + Math.floor(Math.random() * 10000),
      sender: "user",
      text,
      timestamp: "Just now"
    };

    db.supportMessages.push(userMsg);

    // Dynamic support answers representing instant feedback (Simulated support desk bot)
    setTimeout(() => {
      let responseText = "Thanks for reaching out! A support supervisor has been assigned and is verifying your game log details. Rest assured your transactions are safely locked. 🛡️";
      const cleaned = text.toLowerCase();
      if (cleaned.includes("withdraw") || cleaned.includes("pending")) {
        responseText = "We see you have pending withdrawals! Simply tap the 'Approve' button on the transaction in your history to immediately trigger the simulated bank node! 🏦💸";
      } else if (cleaned.includes("deposit") || cleaned.includes("add cash")) {
        responseText = "To add money, tap the '+' gold button in the top bar or use the WALLET screen. Simulated UPI handles instant credentials! 💳";
      } else if (cleaned.includes("ludo") || cleaned.includes("game")) {
        responseText = "Ludo Pro offers Classic, Time, and Turn rules. Select your stakes, hit Join, and roll a 6 to bring pieces onto the Board! 🎲✨";
      }

      db.supportMessages.push({
        id: "A" + Math.floor(Math.random() * 10000),
        sender: "agent",
        text: responseText,
        timestamp: "Just now"
      });
    }, 1000);

    return db.supportMessages;
  }
}
