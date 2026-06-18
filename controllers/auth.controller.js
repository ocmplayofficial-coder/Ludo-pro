import { AuthService } from '../services/auth.service.js';
import { signToken } from '../config/jwt.js';

export class AuthController {
  static async sendOtp(req, res) {
    try {
      console.log('FULL REQUEST BODY =', req.body);
      const { phoneNumber, mobile } = req.body;
      let number = phoneNumber || mobile;
      if (!number) {
        return res.status(400).json({ success: false, error: 'Mobile number is required' });
      }
      // Remove non-digit characters
      number = String(number).replace(/\D/g, '');
      // Strip leading country code 91 if present (India)
      if (number.startsWith('91') && number.length === 12) {
        number = number.substring(2);
      }
      console.log('NORMALIZED NUMBER =', number);
      // Validate Indian mobile format (10 digits)
      if (!/^[0-9]{10}$/.test(number)) {
        return res.status(400).json({ success: false, error: 'Invalid mobile number format' });
      }
      await AuthService.sendOtp(number);
      return res.status(200).json({ success: true, message: 'OTP sent successfully' });
    } catch (err) {
      console.error('SEND OTP ERROR =', err);
      console.error('ERROR STACK =', err.stack);
      return res.status(500).json({
        success: false,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    }
  }

  static async verifyOtp(req, res) {
    try {
      console.log('=================================');
      console.log('VERIFY BODY =', req.body);
      const { phoneNumber, mobile, otp, referralCode } = req.body;
      let number = phoneNumber || mobile;
      if (!number) {
        return res.status(400).json({ success: false, error: 'Phone number is required' });
      }
      if (!otp) {
        return res.status(400).json({ success: false, error: 'OTP is required' });
      }
      // Normalize number
      number = String(number).replace(/\D/g, '');
      if (number.startsWith('91') && number.length === 12) {
        number = number.substring(2);
      }
      console.log('VERIFY NUMBER =', number);
      console.log('VERIFY OTP =', otp);
      console.log('REFERRAL =', referralCode);
      const user = await AuthService.verifyOtp(number, String(otp), referralCode);
      console.log("VERIFY USER", user);
      const token = signToken({ id: user._id });
      // Log decoded token payload for debugging
      try {
        const { verifyToken } = await import('../config/jwt.js');
        const decodedUser = verifyToken(token);
        console.log('JWT TOKEN USER', decodedUser);
      } catch (e) {
        console.error('Failed decoding token for log', e.message);
      }
      console.log('OTP VERIFIED SUCCESSFULLY');
      return res.status(200).json({ success: true, token, user });
    } catch (err) {
      console.error('=================================');
      console.error('VERIFY OTP ERROR =', err.message);
      console.error(err.stack);
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  static logout(req, res) {
    return res.json({ success: true });
  }
}