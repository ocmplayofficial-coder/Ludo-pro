import { UserService } from '../services/user.service.js';

export class UserController {
  static getProfile(req, res) {
    try {
      const profile = UserService.getProfile(req.user);
      return res.json(profile);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static updateProfile(req, res) {
    const { username } = req.body;
    try {
      const updatedUser = UserService.updateProfile(req.user, username);
      return res.json({ success: true, user: updatedUser });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  static getSupportMessages(req, res) {
    try {
      const messages = UserService.getSupportMessages();
      return res.json(messages);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  static addSupportMessage(req, res) {
    const { text } = req.body;
    try {
      const messages = UserService.addSupportMessage(req.user, text);
      return res.json({ success: true, messages });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}
