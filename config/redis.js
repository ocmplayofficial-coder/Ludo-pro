// Mock Redis client for simple session/locking caching mechanics
export const redisClient = {
  get: async (key) => null,
  set: async (key, val) => 'OK',
  del: async (key) => 1,
  incr: async (key) => 1,
};

export async function connectRedis() {
  console.log("Connected to Mock Redis cache client successfully.");
  return true;
}
