const Notification = require("../models/Notification");
const User = require("../models/User");

const emitNotificationToNamespace = (namespace, notification, target, userId) => {
  if (!namespace) return;
  if (target === "all") {
    namespace.emit("new_notification", notification);
  } else if (target === "user" && userId) {
    namespace.to(userId.toString()).emit("new_notification", notification);
  }
};

exports.createNotification = async (req, res) => {
  try {
    const { title, message, type, target, userId } = req.body;

    if (!title || !message || !target) {
      return res.status(400).json({ success: false, message: "Title, message and target are required" });
    }

    if (target === "user" && !userId) {
      return res.status(400).json({ success: false, message: "userId is required for user notifications" });
    }

    const notification = await Notification.create({
      title,
      message,
      type: type || "system",
      target,
      userId: target === "user" ? userId : undefined
    });

    const ludoIo = req.app.get("ludoIo");
    const tpIo = req.app.get("tpIo");

    emitNotificationToNamespace(ludoIo, notification, target, userId);
    emitNotificationToNamespace(tpIo, notification, target, userId);

    console.log("Notification sent:", notification);

    res.status(201).json({ success: true, notification });
  } catch (err) {
    console.error("Create notification error:", err);
    res.status(500).json({ success: false, message: "Failed to create notification" });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await Notification.find({
      $or: [
        { target: "all" },
        { target: "user", userId }
      ]
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, notifications });
  } catch (err) {
    console.error("Fetch notifications error:", err);
    res.status(500).json({ success: false, message: "Unable to fetch notifications" });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    if (notification.target === "user" && notification.userId?.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    notification.isRead = true;
    await notification.save();

    res.json({ success: true, notification });
  } catch (err) {
    console.error("Mark notification read error:", err);
    res.status(500).json({ success: false, message: "Failed to mark notification as read" });
  }
};
