import crypto from 'crypto';
import { env } from './env.js';

const JWT_SECRET = env.JWT_SECRET || 'ludo-pro-arena-super-secret-key-12345';

export function signToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${base64Header}.${base64Payload}`)
    .digest('base64url');
    
  return `${base64Header}.${base64Payload}.${signature}`;
}

export function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [base64Header, base64Payload, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${base64Header}.${base64Payload}`)
      .digest('base64url');
      
    if (signature !== expectedSignature) return null;
    
    const payload = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf8'));
    return payload;
  } catch (err) {
    return null;
  }
}
