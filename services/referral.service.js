import { claimReferralBonus } from '../wallet/referral.service.js';

export class ReferralService {
  static apply(user, code) {
    const tx = claimReferralBonus(user, code);
    if (tx) {
      user.referralCount += 1;
      return user;
    } else {
      throw new Error("Invalid referral code");
    }
  }
}
