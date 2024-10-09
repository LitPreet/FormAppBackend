// otpService.js
import crypto from 'crypto';

export const generateOTP = () => {
    const otp = crypto.randomInt(1000, 10000).toString(); // Range is 1000 to 9999 for a 4-digit OTP
    return otp;
  };
