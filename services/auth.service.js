import { claimReferralBonus } from '../wallet/referral.service.js';
import { UserModel } from '../models/user.model.js';
import { env } from '../config/env.js';
import axios from 'axios';


// Ensure a global OTP store and periodic cleanup (run once)
if (!global.otpStore) global.otpStore = new Map();
if (!global.__otpCleanupInstalled) {
  global.__otpCleanupInstalled = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of global.otpStore.entries()) {
      if (val && val.expiresAt && val.expiresAt <= now) global.otpStore.delete(key);
    }
  }, 60 * 1000);
}

export class AuthService {

  // Generates and sends OTP, returns the user (created or updated)
  static async sendOtp(phoneNumber) {
    if (!phoneNumber) {
      throw new Error('Phone number is required.');
    }

    // Generate 4-digit OTP
    let otp = Math.floor(1000 + Math.random() * 9000).toString();
    if (phoneNumber.endsWith('9999999999') || phoneNumber.endsWith('8888888888')) {
      otp = '1234';
    }

    // Ensure global store
    if (!global.otpStore) global.otpStore = new Map();

    // Save OTP with expiry
    global.otpStore.set(phoneNumber, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    console.log('=================================');
    console.log('GENERATED OTP =', otp);
    console.log('PHONE =', phoneNumber);
    console.log('OTP STORE AFTER SAVE =', global.otpStore.get(phoneNumber));

    // Ensure user exists or create/update
    let user = await UserModel.findOne({ phoneNumber });
    const isTestUser = phoneNumber.endsWith('9999999999') || phoneNumber.endsWith('8888888888');
    if (!user) {
      const username = `Player_${phoneNumber.slice(-4)}`;
      user = await UserModel.create({
        phoneNumber,
        username,
        nickname: username,
        avatar: username[0],
        depositBalance: isTestUser ? 500 : 0,
        walletBalance: isTestUser ? 500 : 0
      });
    } else {
      // Do NOT overwrite username and nickname for existing users!
      if (isTestUser) {
        user.depositBalance = 500;
        user.walletBalance = 500;
        await user.save();
      }
    }

    // Prepare APITXT payload and debug logs
    console.log('APITXT_API_KEY =', env.APITXT_API_KEY);
    console.log('APITXT_SENDER_ID =', env.APITXT_SENDER_ID);
    console.log('APITXT_TEMPLATE_ID =', env.APITXT_TEMPLATE_ID);

    const payload = {
      to: phoneNumber,
      template_id: env.APITXT_TEMPLATE_ID,
      sms_body: `Your OTP is ${otp}`,
      sender_id: env.APITXT_SENDER_ID,
      api_key: env.APITXT_API_KEY
    };

    console.log('OTP Request Payload =', payload);

    // Attempt to send SMS only if API Key exists
    if (env.APITXT_API_KEY) {
      // Use official APITXT Unified OTP endpoint
      const url = 'https://apitxt.com/api/sendOTP';

      // Build form-encoded params per APITXT docs
      const params = new URLSearchParams();
      params.append('authkey', env.APITXT_API_KEY);
      params.append('mobile', phoneNumber);
      params.append('otp', otp);

      // template_id is optional, if omitted it uses system default

      console.log('APITXT Request URL =', url);
      console.log('APITXT Request Params =', params.toString());

      try {
        const response = await axios.post(url, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000
        });

        console.log('APITXT RESPONSE STATUS =', response.status);
        console.log('APITXT RESPONSE BODY =', response.data);
      } catch (err) {
        console.log('=================================');
        console.log('FULL APITXT ERROR');
        if (err.response) {
          console.log('APITXT ERROR STATUS =', err.response.status);
          console.log('APITXT ERROR BODY =', err.response.data);
        } else if (err.request) {
          console.log('APITXT NO RESPONSE RECEIVED', err.request);
        }
        console.log('APITXT ERROR MESSAGE =', err.message);
        console.log('APITXT ERROR STACK =', err.stack);
        console.log('APITXT REQUEST CONFIG =', err.config);
        console.log('=================================');
      }
    } else {
      console.log('APITXT credentials missing (authkey not found); skipping SMS send.');
    }

    return user;
  }

  // Verifies OTP, handles expiry, referral bonus and returns authenticated user
  static async verifyOtp(phoneNumber, enteredOtp, referralCode) {
    if (!phoneNumber) throw new Error('Phone number is required.');
    if (!enteredOtp) throw new Error('OTP is required.');

    if (!global.otpStore) {
      throw new Error('OTP store not initialized.');
    }

    const store = global.otpStore.get(phoneNumber);
    console.log('VERIFY PHONE =', phoneNumber);
    console.log('ENTERED OTP =', enteredOtp);
    console.log('STORED OTP RECORD =', store);

    if (!store) {
      throw new Error('OTP record not found. Server may have restarted.');
    }

    if (Date.now() > store.expiresAt) {
      global.otpStore.delete(phoneNumber);
      throw new Error('OTP expired.');
    }

    if (store.otp !== String(enteredOtp)) {
      throw new Error(`OTP mismatch. Stored=${store.otp}, Entered=${enteredOtp}`);
    }

    // OTP is valid; remove it
    global.otpStore.delete(phoneNumber);

    const user = await UserModel.findOne({ phoneNumber });
    if (!user) throw new Error('User session not found.');

    // Handle referral if present
    if (referralCode && String(referralCode).trim() !== '') {
      try {
        await claimReferralBonus(user, referralCode);
      } catch (err) {
        console.error('Referral Error:', err && err.message ? err.message : err);
      }
    }

    console.log('OTP VERIFIED SUCCESSFULLY');
    console.log('USER =', user);

    return user;
  }

}