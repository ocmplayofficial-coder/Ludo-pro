import crypto from "crypto";
import mongoose from "mongoose";
import { UpigatewayOrderModel } from "../models/upigatewayOrder.model.js";
import { UserModel } from "../models/user.model.js";
import { TransactionModel } from "../models/transaction.model.js";
import * as upiService from "../services/upigateway.service.js";

const WEBHOOK_HEADER = process.env.UPIGATEWAY_WEBHOOK_HEADER || process.env.UPI_GATEWAY_WEBHOOK_HEADER || "x-upigateway-signature";
const WEBHOOK_SECRET = process.env.UPIGATEWAY_WEBHOOK_SECRET || process.env.UPI_GATEWAY_WEBHOOK_SECRET || null;

export async function createOrder(req, res) {
  try {
    console.log('Incoming createOrder request body:', req.body);
    const user = req.user;
    const { amount } = req.body;

    if (!user || !user._id) return res.status(401).json({ success: false, error: "Unauthorized" });

    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return res.status(400).json({ success: false, error: "Invalid amount" });

    const clientTxnId = `C_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;

    // Load fresh user record to compute customer fields and fallback email
    const userDoc = await UserModel.findById(user._id).lean();
    const customer_name = (userDoc && (userDoc.username || userDoc.nickname)) || '';
    const rawPhone = (userDoc && (userDoc.phoneNumber || userDoc.mobile || userDoc.phone)) || '';
    const digits = String(rawPhone || '').replace(/\D/g, '');
    const customer_mobile = rawPhone || '';
    let customer_email = (userDoc && (userDoc.email || userDoc.emailAddress)) || '';

    // If no email in DB, generate fallback using phone number
    if (!customer_email && digits) {
      customer_email = `player${digits}@ocmplay.com`;
    }

    // Validate required customer_email
    if (!customer_email) {
      console.warn('createOrder abort: missing customer_email for user', user._id);
      return res.status(400).json({ success: false, message: 'Customer email missing' });
    }

    // Log the outgoing payload fields for debugging
    console.log('Gateway Payload (preflight):', { clientTxnId, amount: parsed, customer_name, customer_mobile, customer_email });

    // create local order record (after validation)
    const order = await upiService.createLocalOrder({ clientTxnId, userId: user._id, amount: parsed });

    // call gateway with optional override for customer email
    const gatewayResp = await upiService.createGatewayOrder({ clientTxnId, amount: parsed, userId: user._id, customerEmailOverride: customer_email });
    console.log('Gateway Raw Response (service.raw):', JSON.stringify(gatewayResp.raw || {}, null, 2));

    // persist gatewayOrderId and paymentUrl if returned
    const update = {};
    if (gatewayResp.gatewayOrderId) update.gatewayTxnId = gatewayResp.gatewayOrderId;
    if (gatewayResp.paymentUrl) update.paymentUrl = gatewayResp.paymentUrl;
    if (gatewayResp.qr) update.qr = gatewayResp.qr;
    if (Object.keys(update).length > 0) await upiService.markOrderProcessed(order._id, update);

    // Build final response structure
    const finalResponse = {
      success: true,
      paymentUrl: gatewayResp.paymentUrl || null,
      client_txn_id: clientTxnId,
      gatewayResponse: gatewayResp.raw || {}
    };

    // If no paymentUrl but QR exists, include it and attempt to surface a deep link
    if (!finalResponse.paymentUrl && gatewayResp.qr) {
      finalResponse.qr = gatewayResp.qr;
      // attempt to build deep link
      if (typeof gatewayResp.qr === 'string') {
        if (gatewayResp.qr.startsWith('upi://') || gatewayResp.qr.includes('upi:')) {
          finalResponse.paymentUrl = gatewayResp.qr;
        } else {
          finalResponse.paymentUrl = `upi://pay?pa=${encodeURIComponent(gatewayResp.qr)}`;
        }
      }
    }

    console.log('Final Response:', JSON.stringify(finalResponse, null, 2));

    // If neither URL nor QR present, return a failure response with gatewayResponse for debugging
    if (!finalResponse.paymentUrl && !finalResponse.qr) {
      console.warn('Gateway response missing payment URL and QR', finalResponse.gatewayResponse || {});
      return res.status(502).json({ success: false, message: 'Gateway response missing payment URL and QR', gatewayResponse: finalResponse.gatewayResponse || {} });
    }

    return res.json(finalResponse);
  } catch (error) {
    console.error("createOrder error:", error);
    // If error object has gatewayError provide it
    const gatewayError = error.gatewayError || null;
    return res.status(500).json({ success: false, message: error.message || "Server error", error: gatewayError });
  }
}

export async function webhookHandler(req, res) {
  try {
    // Always log headers for investigation
    console.log("Webhook Headers:", req.headers);

    // Read raw body (route configured with express.raw for any content-type)
    let raw = req.body;
    let payloadStr = null;
    if (Buffer.isBuffer(raw)) {
      payloadStr = raw.toString("utf8");
    } else if (typeof raw === 'string') {
      payloadStr = raw;
    }

    console.log("Webhook Raw Body:", payloadStr);

    // Parse payload supporting JSON and x-www-form-urlencoded
    let body = {};
    const contentType = (req.headers['content-type'] || '').toString();
    try {
      if (payloadStr) {
        if (contentType.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(payloadStr);
          for (const [k, v] of params.entries()) body[k] = v;
        } else if (contentType.includes('application/json')) {
          body = JSON.parse(payloadStr);
        } else {
          // attempt JSON then fallback to urlencoded parse
          try { body = JSON.parse(payloadStr); } catch (e) {
            const params = new URLSearchParams(payloadStr);
            for (const [k, v] of params.entries()) body[k] = v;
          }
        }
      } else if (typeof req.body === 'object' && req.body !== null) {
        body = req.body;
      }
    } catch (e) {
      console.warn('Failed to parse webhook body', e.message || e);
      return res.status(400).send('Invalid body');
    }

    console.log('Parsed Webhook Body:', body);

    // verify signature if configured (signature should be computed over raw payload)
    if (WEBHOOK_SECRET) {
      const sig = req.headers[WEBHOOK_HEADER];
      if (!sig) {
        console.warn('Webhook signature missing');
        return res.status(400).send('Missing signature');
      }
      const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(payloadStr || '').digest('hex');
      try {
        if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
          console.warn('Invalid webhook signature');
          return res.status(400).send('Invalid signature');
        }
      } catch (e) {
        console.warn('Signature comparison error', e);
        return res.status(400).send('Invalid signature');
      }
    }

    const client_txn_id = body.client_txn_id || body.clientTxnId || body.client_txnid;
    const amount = body.amount || body.amt || body.transaction_amount;
    const status = body.status || body.order_status || body.payment_status;
    const upi_txn_id = body.upi_txn_id || body.order_id || body.transaction_id || body.txn_id;

    console.log('UPI Webhook received:', { client_txn_id, status, upi_txn_id });

    if (!client_txn_id) {
      console.warn('Webhook missing client_txn_id');
      return res.status(200).send('OK');
    }

    // Start a mongoose session to process idempotently
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await UpigatewayOrderModel.findOne({ clientTxnId: client_txn_id }).session(session);
      if (!order) {
        console.warn('Order not found for client_txn_id', client_txn_id);
        await session.commitTransaction();
        session.endSession();
        return res.status(200).send('OK');
      }

      if (order.processed) {
        console.log('Order already processed', client_txn_id);
        await session.commitTransaction();
        session.endSession();
        return res.status(200).send('OK');
      }

      const normalizedStatus = String(status || '').toLowerCase();
      if (normalizedStatus === 'success' || normalizedStatus === 'paid') {
        // update order
        order.status = 'SUCCESS';
        if (upi_txn_id) order.gatewayTxnId = upi_txn_id;
        order.processed = true;
        order.rawPayload = body;
        await order.save({ session });

        // Prevent duplicate transaction
        const existingTx = await TransactionModel.findOne({ gatewayOrderId: order.gatewayTxnId }).session(session);
        if (existingTx) {
          console.log('Transaction already exists for gateway txn', order.gatewayTxnId);
          await session.commitTransaction();
          session.endSession();
          return res.status(200).send('OK');
        }

        // Credit user wallet atomically
        const creditedAmount = parseFloat(amount || order.amount || 0);
        await UserModel.findByIdAndUpdate(order.user, { $inc: { walletBalance: creditedAmount } }, { session });

        // Create Transaction record
        await TransactionModel.create([{ transactionId: `TXN_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`, user: order.user, paymentMethod: null, type: 'DEPOSIT', amount: creditedAmount, status: 'SUCCESS', gatewayOrderId: order.gatewayTxnId, method: 'UPI Gateway' }], { session });

        await session.commitTransaction();
        session.endSession();
        console.log('Processed UPI success for', client_txn_id);
        return res.status(200).send('OK');
      } else {
        // mark failed
        order.status = 'FAILED';
        order.processed = true;
        order.rawPayload = body;
        await order.save({ session });
        await session.commitTransaction();
        session.endSession();
        console.log('Marked order failed', client_txn_id);
        return res.status(200).send('OK');
      }
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error('Webhook processing failed (transaction):', err);
      return res.status(500).send('ERROR');
    }
  } catch (error) {
    console.error("Webhook handler error:", error);
    return res.status(500).send("ERROR");
  }
}

export function testRoute(req, res) {
  res.json({ success: true, message: "UPIGateway webhook route working" });
}

export async function getStatus(req, res) {
  try {
    const clientTxnId = req.params.clientTxnId;
    if (!clientTxnId) return res.status(400).json({ success: false, error: "Missing clientTxnId" });

    const order = await upiService.findOrderByClientTxn(clientTxnId);
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });

    // If already finalized, return current status
    if (order.status && order.status !== 'PENDING') {
      return res.json({ success: true, status: order.status, order });
    }

    // Check remote gateway status
    const statusResp = await upiService.checkGatewayOrderStatus({ clientTxnId, gatewayOrderId: order.gatewayTxnId });
    const inner = statusResp.data || statusResp || {};

    const remoteStatus = (inner.status || inner.order_status || inner.payment_status || '').toString().toLowerCase();

    if (remoteStatus === 'success' || remoteStatus === 'paid') {
      // process success similar to webhook
      const upi_txn_id = inner.upi_txn_id || inner.transaction_id || inner.txn_id || inner.order_id || null;

      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        // update order
        order.status = 'SUCCESS';
        if (upi_txn_id) order.gatewayTxnId = upi_txn_id;
        order.processed = true;
        order.rawPayload = inner;
        await order.save({ session });

        // prevent duplicate transaction
        const existingTx = await TransactionModel.findOne({ gatewayOrderId: order.gatewayTxnId }).session(session);
        if (!existingTx) {
          // credit wallet
          await UserModel.findByIdAndUpdate(order.user, { $inc: { walletBalance: parseFloat(order.amount) } }, { session });

          // create transaction
          await TransactionModel.create([{ transactionId: `TXN_${Date.now()}_${Math.floor(Math.random()*9000+1000)}`, user: order.user, paymentMethod: null, type: 'DEPOSIT', amount: parseFloat(order.amount), status: 'SUCCESS', gatewayOrderId: order.gatewayTxnId, method: 'UPI Gateway' }], { session });
        }

        await session.commitTransaction();
        session.endSession();
        return res.json({ success: true, status: 'SUCCESS', order });
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Status processing failed:', err);
        return res.status(500).json({ success: false, error: 'Processing failed' });
      }
    }

    if (remoteStatus === 'failed' || remoteStatus === 'cancelled') {
      await upiService.markOrderProcessed(order._id, { status: 'FAILED', processed: true, rawPayload: inner });
      return res.json({ success: true, status: 'FAILED', order });
    }

    // otherwise still pending
    return res.json({ success: true, status: 'PENDING', order });
  } catch (error) {
    console.error('getStatus error:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
