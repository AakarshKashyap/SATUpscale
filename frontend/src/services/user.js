const USER_ID_KEY = 'satup_user_id';

/**
 * Returns the existing user ID from localStorage or creates a new UUIDv4.
 * Uses satup_user_id as the storage key.
 */
export function getUserId() {
  let userId = localStorage.getItem(USER_ID_KEY);
  if (!userId) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      userId = crypto.randomUUID();
    } else {
      // Fallback RFC4122 v4 UUID generator
      userId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    localStorage.setItem(USER_ID_KEY, userId);
  }
  return userId;
}

/**
 * Sets or overrides the current user ID.
 */
export function setUserId(userId) {
  if (userId) {
    localStorage.setItem(USER_ID_KEY, userId);
  } else {
    localStorage.removeItem(USER_ID_KEY);
  }
}
