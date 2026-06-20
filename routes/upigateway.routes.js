import express from "express";
const router = express.Router();

router.post("/webhook", async (req, res) => {
  try {
    console.log("UPIGateway Webhook:", req.body);
    const {
      client_txn_id,
      amount,
      status,
      upi_txn_id,
      customer_mobile,
    } = req.body;

    if (status?.toLowerCase() === "success") {
      console.log("Payment Success:", {
        client_txn_id,
        amount,
        upi_txn_id,
      });
      // TODO:
      // 1. Deposit find by client_txn_id
      // 2. Deposit status = SUCCESS
      // 3. Wallet += amount
      // 4. Transaction create
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook Error:", error);
    return res.status(500).send("ERROR");
  }
});

// Test route
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "UPIGateway webhook route working",
  });
});

export default router;
