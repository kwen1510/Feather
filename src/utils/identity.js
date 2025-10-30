/**
 * Identity Management for Feather Whiteboard
 *
 * Provides persistent student identification across browser tab refreshes,
 * separate from the ephemeral Ably clientId.
 *
 * StudentId is stored in sessionStorage (per-tab) to ensure:
 * - Each browser tab gets a unique student identity
 * - Multiple students can join from the same browser
 * - Student identity persists on tab refresh
 * - Different tabs don't collide with the same ID
 */

const STUDENT_ID_KEY = 'Feather_studentId';

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Get or create persistent student ID (per browser tab)
 *
 * Returns existing ID from sessionStorage if available,
 * otherwise generates new UUID and stores it.
 *
 * Uses sessionStorage (not localStorage) to ensure each tab gets unique ID.
 *
 * @returns {string} Persistent student identifier for this tab
 */
export const getOrCreateStudentId = () => {
  try {
    // Check for existing ID in this tab's session
    let studentId = sessionStorage.getItem(STUDENT_ID_KEY);

    if (studentId) {
      console.log('📱 Using existing studentId:', studentId);
      return studentId;
    }

    // Generate new ID for this tab
    studentId = `student-${generateUUID()}`;
    sessionStorage.setItem(STUDENT_ID_KEY, studentId);

    console.log('🆕 Created new studentId:', studentId);
    return studentId;
  } catch (error) {
    // If sessionStorage is unavailable, generate memory-only ID
    console.warn('⚠️ sessionStorage unavailable, using memory-only studentId');
    return `student-temp-${generateUUID()}`;
  }
};

/**
 * Get current student ID (if exists) for this tab
 *
 * Returns null if no ID has been created yet.
 *
 * @returns {string|null} Student ID or null
 */
export const getStudentId = () => {
  try {
    return sessionStorage.getItem(STUDENT_ID_KEY);
  } catch (error) {
    console.warn('⚠️ Failed to get studentId from sessionStorage');
    return null;
  }
};

/**
 * Clear student ID for this tab (for testing/debugging)
 *
 * Only affects the current browser tab.
 */
export const clearStudentId = () => {
  try {
    sessionStorage.removeItem(STUDENT_ID_KEY);
    console.log('🗑️ Cleared studentId for this tab');
    return true;
  } catch (error) {
    console.error('❌ Failed to clear studentId:', error);
    return false;
  }
};

/**
 * Export student identity info for debugging
 *
 * @returns {Object} Identity information
 */
export const getIdentityInfo = () => {
  const studentId = getStudentId();

  return {
    studentId: studentId,
    hasPersistedId: !!studentId,
    storageAvailable: typeof(Storage) !== "undefined"
  };
};
