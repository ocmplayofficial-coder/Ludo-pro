export class PaymentService {
  static handleCallback(data) {
    return { success: true, message: "Webhook processed mock-successfully." };
  }
}
