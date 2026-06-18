import { ReferralService } from '../services/referral.service.js';

export class ReferralController {
  static apply(req, res) {
    const { code } = req.body;
    try {
      const updatedUser = ReferralService.apply(req.user, code);
      return res.json({ success: true, message: "Referral applied successfully!", user: updatedUser });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
}
