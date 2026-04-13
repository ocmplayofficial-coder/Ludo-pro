const admin = require('./routes/admin');
const routes = admin.stack.filter((layer) => layer.route).map((layer) => ({ path: layer.route.path, methods: layer.route.methods }));
console.log(JSON.stringify(routes, null, 2));
