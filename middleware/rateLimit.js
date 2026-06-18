export function rateLimitMiddleware(req, res, next) {
  // Mock rate limiter, passes all requests in development
  next();
}
