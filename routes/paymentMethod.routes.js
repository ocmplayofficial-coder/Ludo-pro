import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { PaymentMethodModel } from "../models/paymentMethod.model.js";

const router = express.Router();

// Admin-compatible endpoints (mirror admin panel expectations)
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const paymentMethods = await PaymentMethodModel.find().sort({ createdAt: -1 });
    console.log('PAYMENT METHOD FETCHED', paymentMethods.length);
    return res.json({ success: true, paymentMethods });
  } catch (err) {
    console.error('GET_ALL_PAYMENT_METHODS_ERROR', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Temporarily accept any file field to discover frontend key
router.post('/add', authMiddleware, upload.any(), async (req, res) => {
  try {
    const { type, upiId } = req.body;
    // Determine uploaded file (support both array from upload.any() and fields object)
    let filename = '';
    if (Array.isArray(req.files) && req.files.length > 0) {
      filename = req.files[0].filename;
    } else if (req.files) {
      const files = req.files;
      const firstFile = (files.qrCode && files.qrCode[0]) || (files.qrImage && files.qrImage[0]) || (files.file && files.file[0]) || (files.image && files.image[0]);
      filename = firstFile?.filename || '';
    }

    const paymentMethod = await PaymentMethodModel.create({
      type: type || 'upi',
      upiId: upiId || '',
      qrCode: filename,
      active: true
    });
    console.log('PAYMENT METHOD SAVED', paymentMethod._id);
    return res.json({ success: true, paymentMethod });
  } catch (err) {
    console.error('ADD_PAYMENT_METHOD_ERROR', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', authMiddleware, upload.any(), async (req, res) => {
  try {
    const updates = {};
    const { type, upiId, active } = req.body;
    if (type) updates.type = type;
    if (upiId !== undefined) updates.upiId = upiId;
    if (active !== undefined) updates.active = active === 'true' || active === true;
    // Determine uploaded file name (support upload.any() -> array, or fields object)
    let filename = '';
    if (Array.isArray(req.files) && req.files.length > 0) {
      filename = req.files[0].filename;
    } else if (req.files) {
      const filesObj = req.files;
      const firstFile = (filesObj.qrCode && filesObj.qrCode[0]) || (filesObj.qrImage && filesObj.qrImage[0]) || (filesObj.file && filesObj.file[0]) || (filesObj.image && filesObj.image[0]);
      filename = firstFile?.filename || '';
    }
    if (filename) updates.qrCode = filename;

    const pm = await PaymentMethodModel.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!pm) return res.status(404).json({ success: false, error: 'Payment method not found' });
    console.log('PAYMENT METHOD UPDATED', pm._id);
    return res.json({ success: true, paymentMethod: pm });
  } catch (err) {
    console.error('UPDATE_PAYMENT_METHOD_ERROR', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await PaymentMethodModel.findByIdAndDelete(req.params.id);
    console.log('PAYMENT METHOD DELETED', req.params.id);
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE_PAYMENT_METHOD_ERROR', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Public endpoint: get the next payment method using rotation
router.get('/next', async (req, res) => {
  try {
    const activeMethods = await PaymentMethodModel.find({ active: true }).sort({ createdAt: 1 });
    if (!activeMethods.length) {
      return res.status(404).json({ success: false, error: 'No active payment methods configured by admin' });
    }

    // Filter out methods without uploaded QR image (we require admin uploaded QR)
    const validMethods = activeMethods.filter(m => m.qrCode && m.qrCode.length > 0);
    if (!validMethods.length) {
      return res.status(404).json({ success: false, error: 'No active payment methods with uploaded QR image' });
    }

    const { PaymentMethodRotationModel } = await import('../models/paymentMethodRotation.model.js');
    const rotationDoc = await PaymentMethodRotationModel.findOneAndUpdate({}, { $inc: { counter: 1 } }, { new: true, upsert: true });
    const index = (rotationDoc.counter - 1) % validMethods.length;
    const method = validMethods[index];

    // Update usage stats
    try {
      await PaymentMethodModel.findByIdAndUpdate(method._id, { $inc: { usageCount: 1 }, lastUsedAt: new Date() });
    } catch (e) {
      console.warn('Failed to update usage stats for payment method', method._id, e.message);
    }

    console.log('PAYMENT METHOD ROTATED', method._id);

    // Return in expected shape
    const payload = {
      success: true,
      paymentMethod: {
        _id: method._id,
        upiId: method.upiId || '',
        qrCode: method.qrCode ? `/uploads/${method.qrCode}` : '',
        type: method.type
      }
    };

    console.log('PAYMENT METHOD SENT TO USER', method._id);
    return res.json(payload);
  } catch (err) {
    console.error('GET_NEXT_PAYMENT_METHOD_ERROR', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
