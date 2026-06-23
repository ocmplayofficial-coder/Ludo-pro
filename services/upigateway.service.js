import axios from "axios";
import { UpigatewayOrderModel } from "../models/upigatewayOrder.model.js";
import { UserModel } from "../models/user.model.js";

const CREATE_ORDER_URL = process.env.UPIGATEWAY_CREATE_ORDER_URL || "https://api.ekqr.in/api/create_order";
const CHECK_STATUS_URL = process.env.UPIGATEWAY_CHECK_STATUS_URL || "https://api.ekqr.in/api/check_order_status";
const API_KEY = process.env.UPIGATEWAY_API_KEY || process.env.UPI_GATEWAY_API_KEY || '';
const REDIRECT_URL = process.env.UPIGATEWAY_REDIRECT_URL || process.env.FRONTEND_URL || '';

// Log env availability for diagnostics
console.log('UPI env:', {
  UPIGATEWAY_CREATE_ORDER_URL: !!process.env.UPIGATEWAY_CREATE_ORDER_URL,
  UPIGATEWAY_CHECK_STATUS_URL: !!process.env.UPIGATEWAY_CHECK_STATUS_URL,
  UPIGATEWAY_API_KEY: !!process.env.UPIGATEWAY_API_KEY || !!process.env.UPI_GATEWAY_API_KEY,
  UPIGATEWAY_REDIRECT_URL: !!process.env.UPIGATEWAY_REDIRECT_URL || !!process.env.FRONTEND_URL
});

function extractPaymentUrlFromResponse(data) {
  if (!data) return { paymentUrl: null, qr: null };

  // flatten common locations
  const candidates = [];
  if (data.payment_url) candidates.push(data.payment_url);
  if (data.paymentUrl) candidates.push(data.paymentUrl);
  if (data.redirect_url) candidates.push(data.redirect_url);
  if (data.redirectUrl) candidates.push(data.redirectUrl);
  if (data.link) candidates.push(data.link);
  if (data.url) candidates.push(data.url);
  if (data.deepLink) candidates.push(data.deepLink);
  if (data.deep_link) candidates.push(data.deep_link);
  // nested
  if (data.data && typeof data.data === 'object') {
    candidates.push(data.data.payment_url, data.data.paymentUrl, data.data.redirect_url, data.data.link, data.data.url, data.data.deepLink, data.data.deep_link);
  }
  if (data.result && typeof data.result === 'object') {
    candidates.push(data.result.payment_url, data.result.paymentUrl, data.result.link, data.result.url);
  }

  // QR related fields
  const qrCandidates = [];
  if (data.qr) qrCandidates.push(data.qr);
  if (data.qr_code) qrCandidates.push(data.qr_code);
  if (data.qr_string) qrCandidates.push(data.qr_string);
  if (data.data && data.data.qr) qrCandidates.push(data.data.qr);

  const paymentUrl = candidates.find(Boolean) || null;
  const qr = qrCandidates.find(Boolean) || null;

  return { paymentUrl, qr };
}

export async function createGatewayOrder({ clientTxnId, amount, userId, customerEmailOverride = null }) {
  // populate customer fields when possible
  let customer_name = "";
  let customer_email = "";
  let customer_mobile = "";
  if (userId) {
    try {
      const user = await UserModel.findById(userId).lean();
      if (user) {
        customer_name = user.username || user.nickname || "";
        customer_mobile = user.phoneNumber || "";
        customer_email = user.email || user.emailAddress || "";
      }
    } catch (e) {
      console.warn("Failed to load user for gateway payload", e.message || e);
    }
  }

  // allow controller to override or provide fallback
  if (customerEmailOverride) {
    customer_email = customerEmailOverride;
  }

  const payload = {
    key: API_KEY,
    client_txn_id: clientTxnId,
    amount: String(amount),
    p_info: "Ludo Deposit",
    customer_name,
    customer_email,
    customer_mobile,
    redirect_url: REDIRECT_URL
  };

  // Some gateways expect different field names for email — include common variants
  payload.email = customer_email;
  payload.customerEmail = customer_email;

  // Validate envs
  if (!API_KEY) {
    const msg = 'UPIGATEWAY_API_KEY is not configured';
    console.error(msg);
    throw new Error(msg);
  }
  if (!REDIRECT_URL) {
    console.warn('UPIGATEWAY_REDIRECT_URL / FRONTEND_URL is not configured; continue but gateway may reject redirect_url');
  }

  console.log("FINAL GATEWAY PAYLOAD");
  console.log(JSON.stringify({ url: CREATE_ORDER_URL, payload: { ...payload, key: payload.key ? '****' : '' } }, null, 2));

  try {
    const resp = await axios.post(CREATE_ORDER_URL, payload, { headers: { "Content-Type": "application/json" }, timeout: 15000 });
    console.log("FULL GATEWAY RESPONSE:");
    console.log(JSON.stringify(resp.data, null, 2));
    const data = resp.data || {};

    // Attempt to locate payment URL or QR in various shapes
    const { paymentUrl, qr } = extractPaymentUrlFromResponse(data) || { paymentUrl: null, qr: null };

    console.log('Extracted paymentUrl:', paymentUrl);
    console.log('Extracted qr:', qr);

    // Try to find gateway order id
    const gatewayOrderId = data.order_id || data.orderId || (data.data && (data.data.order_id || data.data.orderId)) || null;

    // If paymentUrl missing but QR exists, try to build a UPI deep link if possible
    let finalPaymentUrl = paymentUrl;
    if (!finalPaymentUrl && qr) {
      // If QR looks like a UPI string (contains "upi://pay" or "@"), prefer direct deep link
      if (typeof qr === 'string') {
        if (qr.startsWith('upi://') || qr.includes('upi:')) finalPaymentUrl = qr;
        else {
          // try to build a deep link using upi://pay?pa=... if qr contains a payee
          finalPaymentUrl = `upi://pay?pa=${encodeURIComponent(qr)}`;
        }
      }
    }

    return {
      paymentUrl: finalPaymentUrl || null,
      gatewayOrderId: gatewayOrderId || null,
      raw: data,
      qr: qr || null
    };
  } catch (err) {
    console.error("UPI create_order error:", err.response?.data || err.message || err);
    // attach response body if available
    const body = err.response?.data || null;
    throw Object.assign(new Error('Gateway create_order failed'), { gatewayError: body });
  }
}

export async function checkGatewayOrderStatus({ clientTxnId, gatewayOrderId }) {
  const payload = { key: API_KEY };
  if (gatewayOrderId) payload.order_id = gatewayOrderId;
  else if (clientTxnId) payload.client_txn_id = clientTxnId;

  console.log("UPI check_order_status payload:", payload);
  try {
    const resp = await axios.post(CHECK_STATUS_URL, payload, { headers: { "Content-Type": "application/json" }, timeout: 10000 });
    console.log("UPI check_order_status response:", resp.data);
    return resp.data;
  } catch (err) {
    console.error("UPI check_order_status error:", err.response?.data || err.message || err);
    throw err;
  }
}

export async function createLocalOrder({ clientTxnId, userId, amount }) {
  const order = await UpigatewayOrderModel.create({
    clientTxnId,
    user: userId,
    amount,
    status: "PENDING",
  });

  return order;
}

export async function findOrderByClientTxn(clientTxnId) {
  return UpigatewayOrderModel.findOne({ clientTxnId });
}

export async function markOrderProcessed(orderId, update) {
  return UpigatewayOrderModel.findByIdAndUpdate(orderId, { $set: update }, { new: true });
}
