/**
 * IndexedDB Persistence Layer for Feather Whiteboard
 *
 * Provides local-first storage for:
 * - Student drawings
 * - Teacher annotations
 * - Session state
 *
 * Syncs with Supabase in background for durability.
 */

const DB_NAME = 'FeatherWhiteboardDB';
const DB_VERSION = 1;

const STORES = {
  STUDENT_WORK: 'studentWork',
  TEACHER_ANNOTATIONS: 'teacherAnnotations',
  SESSION_STATE: 'sessionState'
};

let dbInstance = null;

/**
 * Initialize IndexedDB with schema
 * Creates object stores and indexes on first run
 */
export const initDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('❌ IndexedDB: Failed to open database', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('✅ IndexedDB: Database opened successfully');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log('🔧 IndexedDB: Upgrading database schema to version', DB_VERSION);

      // Student Work Store
      if (!db.objectStoreNames.contains(STORES.STUDENT_WORK)) {
        const studentStore = db.createObjectStore(STORES.STUDENT_WORK, { keyPath: 'id' });
        studentStore.createIndex('studentId', 'studentId', { unique: false });
        studentStore.createIndex('sessionId', 'sessionId', { unique: false });
        studentStore.createIndex('questionId', 'questionId', { unique: false });
        studentStore.createIndex('timestamp', 'timestamp', { unique: false });
        studentStore.createIndex('composite', ['studentId', 'sessionId', 'questionId'], { unique: false });
        console.log('✅ Created studentWork store');
      }

      // Teacher Annotations Store
      if (!db.objectStoreNames.contains(STORES.TEACHER_ANNOTATIONS)) {
        const teacherStore = db.createObjectStore(STORES.TEACHER_ANNOTATIONS, { keyPath: 'id' });
        teacherStore.createIndex('sessionId', 'sessionId', { unique: false });
        teacherStore.createIndex('targetStudentId', 'targetStudentId', { unique: false });
        teacherStore.createIndex('questionId', 'questionId', { unique: false });
        teacherStore.createIndex('timestamp', 'timestamp', { unique: false });
        teacherStore.createIndex('composite', ['sessionId', 'targetStudentId', 'questionId'], { unique: false });
        console.log('✅ Created teacherAnnotations store');
      }

      // Session State Store
      if (!db.objectStoreNames.contains(STORES.SESSION_STATE)) {
        const sessionStore = db.createObjectStore(STORES.SESSION_STATE, { keyPath: 'sessionId' });
        sessionStore.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('✅ Created sessionState store');
      }
    };
  });
};

/**
 * Save student work to IndexedDB
 * @param {string} studentId - Persistent student identifier
 * @param {string} sessionId - Current session ID
 * @param {string} questionId - Current question ID
 * @param {Array} lines - Array of line objects
 * @param {Object} meta - Canvas metadata (base, display, scale)
 * @param {Array} teacherAnnotations - Optional teacher annotations array
 */
export const saveStudentWork = async (studentId, sessionId, questionId, lines, meta, teacherAnnotations = null) => {
  try {
    const db = await initDB();
    const id = `${studentId}-${sessionId}-${questionId}`;

    const record = {
      id,
      studentId,
      sessionId,
      questionId,
      lines,
      meta,
      teacherAnnotations: teacherAnnotations || [],
      timestamp: Date.now()
    };

    const tx = db.transaction(STORES.STUDENT_WORK, 'readwrite');
    const store = tx.objectStore(STORES.STUDENT_WORK);

    await store.put(record);

    const teacherCount = teacherAnnotations ? teacherAnnotations.length : 0;
    console.log('💾 Saved student work to IndexedDB:', id, lines.length, 'lines,', teacherCount, 'teacher annotations');
    return true;
  } catch (error) {
    console.error('❌ Failed to save student work:', error);
    return false;
  }
};

/**
 * Load student work from IndexedDB
 * @param {string} studentId - Persistent student identifier
 * @param {string} sessionId - Current session ID
 * @param {string} questionId - Current question ID
 * @returns {Object|null} Saved work object {lines, meta, teacherAnnotations} or null
 */
export const loadStudentWork = async (studentId, sessionId, questionId) => {
  try {
    const db = await initDB();
    const id = `${studentId}-${sessionId}-${questionId}`;

    const tx = db.transaction(STORES.STUDENT_WORK, 'readonly');
    const store = tx.objectStore(STORES.STUDENT_WORK);

    const request = store.get(id);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          const teacherCount = result.teacherAnnotations?.length || 0;
          console.log('📂 Loaded student work from IndexedDB:', id, result.lines?.length || 0, 'lines,', teacherCount, 'teacher annotations');
          resolve(result);
        } else {
          console.log('ℹ️ No saved student work found:', id);
          resolve(null);
        }
      };
      request.onerror = () => {
        console.error('❌ Failed to load student work:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('❌ Failed to load student work:', error);
    return null;
  }
};

/**
 * Save teacher annotation to IndexedDB
 * @param {string} sessionId - Current session ID
 * @param {string} targetStudentId - Student being annotated (persistent studentId, not clientId)
 * @param {string} questionId - Current question ID
 * @param {Array} annotations - Array of line objects
 */
export const saveTeacherAnnotation = async (sessionId, targetStudentId, questionId, annotations) => {
  try {
    const db = await initDB();
    const id = `${sessionId}-${targetStudentId}-${questionId}`;

    const record = {
      id,
      sessionId,
      targetStudentId,
      questionId,
      annotations,
      timestamp: Date.now()
    };

    const tx = db.transaction(STORES.TEACHER_ANNOTATIONS, 'readwrite');
    const store = tx.objectStore(STORES.TEACHER_ANNOTATIONS);

    await store.put(record);

    console.log('💾 Saved teacher annotation to IndexedDB:', id, annotations.length, 'lines');
    return true;
  } catch (error) {
    console.error('❌ Failed to save teacher annotation:', error);
    return false;
  }
};

/**
 * Load all teacher annotations for a session and question
 * @param {string} sessionId - Current session ID
 * @param {string} questionId - Current question ID
 * @returns {Object} Map of persistent studentId → annotations array
 */
export const loadTeacherAnnotations = async (sessionId, questionId) => {
  try {
    const db = await initDB();
    const tx = db.transaction(STORES.TEACHER_ANNOTATIONS, 'readonly');
    const store = tx.objectStore(STORES.TEACHER_ANNOTATIONS);
    const index = store.index('sessionId');

    // Use sessionId index to filter, then manually check questionId
    const range = IDBKeyRange.only(sessionId);
    const request = index.openCursor(range);

    return new Promise((resolve, reject) => {
      const results = {};

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const record = cursor.value;
          // Filter by questionId as well
          if (record.questionId === questionId) {
            results[record.targetStudentId] = record.annotations;
          }
          cursor.continue();
        } else {
          const count = Object.keys(results).length;
          console.log('📂 Loaded teacher annotations from IndexedDB:', count, 'students');
          resolve(results);
        }
      };

      request.onerror = () => {
        console.error('❌ Failed to load teacher annotations:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('❌ Failed to load teacher annotations:', error);
    return {};
  }
};

/**
 * Save complete session state for teacher
 * @param {string} sessionId - Current session ID
 * @param {Object} state - Complete dashboard state
 */
export const saveSessionState = async (sessionId, state) => {
  try {
    const db = await initDB();

    const record = {
      sessionId,
      students: state.students || {},
      questionNumber: state.questionNumber || 0,
      currentQuestionId: state.currentQuestionId || null,
      sharedImage: state.sharedImage || null,
      timestamp: Date.now()
    };

    const tx = db.transaction(STORES.SESSION_STATE, 'readwrite');
    const store = tx.objectStore(STORES.SESSION_STATE);

    await store.put(record);

    const studentCount = Object.keys(record.students).length;
    console.log('💾 Saved session state to IndexedDB:', sessionId, studentCount, 'students, Q', record.questionNumber);
    return true;
  } catch (error) {
    console.error('❌ Failed to save session state:', error);
    return false;
  }
};

/**
 * Load complete session state for teacher
 * @param {string} sessionId - Current session ID
 * @returns {Object|null} Saved state object or null
 */
export const loadSessionState = async (sessionId) => {
  try {
    const db = await initDB();
    const tx = db.transaction(STORES.SESSION_STATE, 'readonly');
    const store = tx.objectStore(STORES.SESSION_STATE);

    const request = store.get(sessionId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          const studentCount = Object.keys(result.students || {}).length;
          console.log('📂 Loaded session state from IndexedDB:', sessionId, studentCount, 'students, Q', result.questionNumber);
          resolve(result);
        } else {
          console.log('ℹ️ No saved session state found:', sessionId);
          resolve(null);
        }
      };
      request.onerror = () => {
        console.error('❌ Failed to load session state:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('❌ Failed to load session state:', error);
    return null;
  }
};

/**
 * Clear all data for a specific session
 * @param {string} sessionId - Session ID to clear
 */
export const clearSessionData = async (sessionId) => {
  try {
    const db = await initDB();

    // Clear student work
    let tx = db.transaction(STORES.STUDENT_WORK, 'readwrite');
    let store = tx.objectStore(STORES.STUDENT_WORK);
    let index = store.index('sessionId');
    let request = index.openCursor(IDBKeyRange.only(sessionId));

    await new Promise((resolve) => {
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
    });

    // Clear teacher annotations
    tx = db.transaction(STORES.TEACHER_ANNOTATIONS, 'readwrite');
    store = tx.objectStore(STORES.TEACHER_ANNOTATIONS);
    index = store.index('sessionId');
    request = index.openCursor(IDBKeyRange.only(sessionId));

    await new Promise((resolve) => {
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
    });

    // Clear session state
    tx = db.transaction(STORES.SESSION_STATE, 'readwrite');
    store = tx.objectStore(STORES.SESSION_STATE);
    await store.delete(sessionId);

    console.log('🗑️ Cleared all data for session:', sessionId);
    return true;
  } catch (error) {
    console.error('❌ Failed to clear session data:', error);
    return false;
  }
};

/**
 * Cleanup old sessions (older than specified days)
 * @param {number} daysOld - Age threshold in days (default 7)
 */
export const cleanupOldSessions = async (daysOld = 7) => {
  try {
    const db = await initDB();
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    // Clean student work
    let tx = db.transaction(STORES.STUDENT_WORK, 'readwrite');
    let store = tx.objectStore(STORES.STUDENT_WORK);
    let index = store.index('timestamp');
    let request = index.openCursor(IDBKeyRange.upperBound(cutoff));

    await new Promise((resolve) => {
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          resolve();
        }
      };
    });

    // Clean teacher annotations
    tx = db.transaction(STORES.TEACHER_ANNOTATIONS, 'readwrite');
    store = tx.objectStore(STORES.TEACHER_ANNOTATIONS);
    index = store.index('timestamp');
    request = index.openCursor(IDBKeyRange.upperBound(cutoff));

    await new Promise((resolve) => {
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          resolve();
        }
      };
    });

    // Clean session state
    tx = db.transaction(STORES.SESSION_STATE, 'readwrite');
    store = tx.objectStore(STORES.SESSION_STATE);
    index = store.index('timestamp');
    request = index.openCursor(IDBKeyRange.upperBound(cutoff));

    await new Promise((resolve) => {
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          resolve();
        }
      };
    });

    if (deletedCount > 0) {
      console.log(`🗑️ Cleaned up ${deletedCount} old records (older than ${daysOld} days)`);
    }
    return deletedCount;
  } catch (error) {
    console.error('❌ Failed to cleanup old sessions:', error);
    return 0;
  }
};

/**
 * Get database statistics for debugging
 */
export const getDatabaseStats = async () => {
  try {
    const db = await initDB();
    const stats = {};

    for (const storeName of Object.values(STORES)) {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const countRequest = store.count();

      stats[storeName] = await new Promise((resolve) => {
        countRequest.onsuccess = () => resolve(countRequest.result);
      });
    }

    console.log('📊 IndexedDB Stats:', stats);
    return stats;
  } catch (error) {
    console.error('❌ Failed to get database stats:', error);
    return {};
  }
};

/**
 * Load teacher's own annotations for a specific student and question
 * Used when teacher refreshes and needs to restore their annotations
 * @param {string} sessionId - Current session ID
 * @param {string} targetStudentId - Student being annotated
 * @param {string} questionId - Current question ID
 * @returns {Array} Array of annotation line objects
 */
export const loadTeacherOwnAnnotations = async (sessionId, targetStudentId, questionId) => {
  try {
    const db = await initDB();
    const id = `${sessionId}-${targetStudentId}-${questionId}`;

    const tx = db.transaction(STORES.TEACHER_ANNOTATIONS, 'readonly');
    const store = tx.objectStore(STORES.TEACHER_ANNOTATIONS);

    const request = store.get(id);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log('📂 Loaded teacher own annotations from IndexedDB:', id, result.annotations?.length || 0, 'lines');
          resolve(result.annotations || []);
        } else {
          console.log('ℹ️ No saved teacher annotations found:', id);
          resolve([]);
        }
      };
      request.onerror = () => {
        console.error('❌ Failed to load teacher annotations:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('❌ Failed to load teacher annotations:', error);
    return [];
  }
};

/**
 * Clear annotations for a specific student and question
 * Used when teacher clears canvas or moves to new question
 * @param {string} sessionId - Current session ID
 * @param {string} targetStudentId - Student ID
 * @param {string} questionId - Current question ID
 */
export const clearTeacherAnnotations = async (sessionId, targetStudentId, questionId) => {
  try {
    const db = await initDB();
    const id = `${sessionId}-${targetStudentId}-${questionId}`;

    const tx = db.transaction(STORES.TEACHER_ANNOTATIONS, 'readwrite');
    const store = tx.objectStore(STORES.TEACHER_ANNOTATIONS);

    await store.delete(id);
    console.log('🗑️ Cleared teacher annotations:', id);
    return true;
  } catch (error) {
    console.error('❌ Failed to clear teacher annotations:', error);
    return false;
  }
};

/**
 * Clear student work for a specific question
 * Used when student clears canvas or moves to new question
 * @param {string} studentId - Persistent student identifier
 * @param {string} sessionId - Current session ID
 * @param {string} questionId - Current question ID
 */
export const clearStudentWork = async (studentId, sessionId, questionId) => {
  try {
    const db = await initDB();
    const id = `${studentId}-${sessionId}-${questionId}`;

    const tx = db.transaction(STORES.STUDENT_WORK, 'readwrite');
    const store = tx.objectStore(STORES.STUDENT_WORK);

    await store.delete(id);
    console.log('🗑️ Cleared student work:', id);
    return true;
  } catch (error) {
    console.error('❌ Failed to clear student work:', error);
    return false;
  }
};
