const sendOtp = async (req, res) => {
  try {
    const { phone: rawPhone } = req.body;

    console.log("[PHONE INPUT]", rawPhone);

    // ===============================
    // NORMALIZE PHONE
    // ===============================
    const cleaned = normalizeIndianPhone(rawPhone);

    console.log("[NORMALIZED PHONE]", cleaned);

    if (!cleaned) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid phone number. Enter valid 10 digit Indian number.",
      });
    }

    // ===============================
    // GENERATE OTP
    // ===============================
    const otp = Math.floor(
      1000 + Math.random() * 9000
    ).toString();

    const expiresAt =
      Date.now() + OTP_EXPIRY * 1000;

    // ===============================
    // STORE OTP
    // ===============================
    OTP_MAP.set(cleaned, {
      otp,
      expiresAt,
    });

    console.log(
      `[OTP STORED] ${cleaned} => ${otp} (expires ${OTP_EXPIRY}s)`
    );

    // ===============================
    // CHECK API KEY
    // ===============================
    if (!APITXT_API_KEY) {
      console.log("❌ APITXT API KEY MISSING");

      return res.status(500).json({
        success: false,
        message: "SMS provider not configured",
      });
    }

    // ===============================
    // SEND OTP USING APITXT
    // ===============================
    try {
      console.log("========== APITXT REQUEST ==========");

      console.log({
        authkey: APITXT_API_KEY,
        mobile: `91${cleaned}`,
        otp: otp,
        sender: APITXT_SENDER_ID,
      });

      console.log("====================================");

      const response = await axios.get(
        "https://apitxt.com/api/sendOTP",
        {
          params: {
            authkey: APITXT_API_KEY,
            mobile: `91${cleaned}`,
            otp: otp,
            sender: APITXT_SENDER_ID,
          },

          timeout: 15000,
        }
      );

      // ===============================
      // RESPONSE LOG
      // ===============================
      console.log("========== APITXT RESPONSE ==========");

      console.log(response.data);

      console.log("=====================================");

      const responseText = JSON.stringify(
        response.data
      ).toLowerCase();

      // ===============================
      // SUCCESS CHECK
      // ===============================
      if (
        responseText.includes("success") ||
        responseText.includes("sent") ||
        responseText.includes("otp")
      ) {
        console.log(
          `✅ OTP SENT SUCCESSFULLY TO ${cleaned}`
        );

        return res.status(200).json({
          success: true,
          message: "OTP sent successfully",

          // testing only
          otp: isProd ? undefined : otp,
        });
      }

      // ===============================
      // PROVIDER FAILED
      // ===============================
      console.log(
        "❌ APITXT FAILED:",
        response.data
      );

      return res.status(500).json({
        success: false,
        message: "OTP provider failed",
        providerResponse: response.data,

        // testing fallback
        otp: isProd ? undefined : otp,
      });
    } catch (error) {
      // ===============================
      // API ERROR
      // ===============================
      console.log("========== APITXT ERROR ==========");

      console.log(
        error.response?.data ||
          error.message ||
          error
      );

      console.log("==================================");

      return res.status(500).json({
        success: false,
        message: "SMS provider failed",

        error:
          error.response?.data ||
          error.message ||
          "Unknown SMS Error",

        // testing fallback
        otp: isProd ? undefined : otp,
      });
    }
  } catch (err) {
    // ===============================
    // INTERNAL ERROR
    // ===============================
    console.log(
      "[SEND OTP ERROR]",
      err.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to generate OTP",
    });
  }
};
