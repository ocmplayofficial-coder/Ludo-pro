/**
 * 🔐 ROLE MIDDLEWARE (RBAC)
 * Admin panel aur special features ko protect karne ke liye.
 * Usage: router.get('/admin/stats', auth, role('admin', 'super-admin'), controller)
 */

module.exports = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      // 1. Check if user is attached (Auth middleware check)
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "🔒 Authentication required before role check."
        });
      }

      // 2. 🔥 ROLE VALIDATION
      // Agar allowedRoles empty hai toh default "admin" check karega
      const rolesToVerify = allowedRoles.length > 0 ? allowedRoles : ["admin"];

      const hasAccess = rolesToVerify.includes(req.user.role);

      if (!hasAccess) {
        console.warn(`🛡️ Security: Un-authorized access attempt by ${req.user.phone} as ${req.user.role}`);
        
        return res.status(403).json({
          success: false,
          message: "🚫 Access Denied. You don't have permission for this action."
        });
      }

      // 3. Permission Granted
      next();
    } catch (error) {
      console.error("🛡️ ROLE_MIDDLEWARE_ERROR:", error.message);
      res.status(500).json({
        success: false,
        message: "⚠️ Internal authorization error."
      });
    }
  };
};