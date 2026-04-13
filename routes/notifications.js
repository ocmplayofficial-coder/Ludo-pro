const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const notificationController = require("../controllers/notificationController");

router.post(
  "/notifications",
  auth,
  roleMiddleware("admin", "super-admin"),
  notificationController.createNotification
);

router.get("/notifications", auth, notificationController.getNotifications);
router.put("/notifications/:id/read", auth, notificationController.markAsRead);

module.exports = router;
