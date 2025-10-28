/**
 * Identity Management for Feather Whiteboard
 *
 * Provides persistent student identification across browser refreshes,
 * separate from the ephemeral Ably clientId.
 *
 * StudentId is stored in localStorage and persists across sessions,
 * allowing us to:
 * - Recover student work after refresh
 * - Associate multiple clientIds with the same student
 * - Track student progress across disconnections
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
 * Get or create persistent student ID
 *
 * Returns existing ID from localStorage if available,
 * otherwise generates new UUID and stores it.
 *
 * @returns {string} Persistent student identifier
 */
export const getOrCreateStudentId = () => {
  try {
    // Check for existing ID
    let studentId = localStorage.getItem(STUDENT_ID_KEY);

    if (studentId) {
      console.log('📱 Using existing studentId:', studentId);
      return studentId;
    }

    // Generate new ID
    studentId = `student-${generateUUID()}`;
    localStorage.setItem(STUDENT_ID_KEY, studentId);

    console.log('🆕 Created new studentId:', studentId);
    return studentId;
  } catch (error) {
    // If localStorage is unavailable, generate session-only ID
    console.warn('⚠️ localStorage unavailable, using session-only studentId');
    return `student-temp-${generateUUID()}`;
  }
};

/**
 * Get current student ID (if exists)
 *
 * Returns null if no ID has been created yet.
 *
 * @returns {string|null} Student ID or null
 */
export const getStudentId = () => {
  try {
    return localStorage.getItem(STUDENT_ID_KEY);
  } catch (error) {
    console.warn('⚠️ Failed to get studentId from localStorage');
    return null;
  }
};

/**
 * Clear student ID (for testing/debugging)
 *
 * Use with caution - this will orphan any saved work.
 */
export const clearStudentId = () => {
  try {
    localStorage.removeItem(STUDENT_ID_KEY);
    console.log('🗑️ Cleared studentId');
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
