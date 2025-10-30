/**
 * IndexedDB utility for local stroke storage
 * Stores own strokes (teacher annotations OR student lines) locally
 */

const DB_NAME = 'feather-whiteboard';
const DB_VERSION = 1;
const TEACHER_STORE = 'teacher-strokes';
const STUDENT_STORE = 'student-strokes';

let dbInstance = null;

/**
 * Initialize IndexedDB with object stores for teacher and student strokes
 * @returns {Promise<IDBDatabase>}
 */
export const initDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('✅ IndexedDB initialized');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create teacher strokes store if it doesn't exist
      if (!db.objectStoreNames.contains(TEACHER_STORE)) {
        const teacherStore = db.createObjectStore(TEACHER_STORE, { keyPath: 'id' });
        teacherStore.createIndex('roomId', 'roomId', { unique: false });
        teacherStore.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('Created teacher-strokes object store');
      }

      // Create student strokes store if it doesn't exist
      if (!db.objectStoreNames.contains(STUDENT_STORE)) {
        const studentStore = db.createObjectStore(STUDENT_STORE, { keyPath: 'id' });
        studentStore.createIndex('roomId', 'roomId', { unique: false });
        studentStore.createIndex('studentId', 'studentId', { unique: false });
        studentStore.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('Created student-strokes object store');
      }
    };
  });
};

/**
 * Save a single stroke to IndexedDB
 * @param {Object} stroke - The stroke object to save
 * @param {string} roomId - The room ID
 * @param {string} userId - The user ID (studentId for students, teacherId for teacher)
 * @param {string} userType - 'teacher' or 'student'
 * @returns {Promise<void>}
 */
export const saveStroke = async (stroke, roomId, userId, userType) => {
  try {
    const db = await initDB();
    const storeName = userType === 'teacher' ? TEACHER_STORE : STUDENT_STORE;
    
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    
    // Create a unique ID for this stroke
    const id = `${roomId}:${userId}:${stroke.strokeId || Date.now()}`;
    
    const strokeData = {
      id,
      roomId,
      userId,
      stroke,
      timestamp: Date.now()
    };
    
    const request = store.put(strokeData);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('Error saving stroke to IndexedDB:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('saveStroke error:', error);
    throw error;
  }
};

/**
 * Load all strokes for a specific user from IndexedDB
 * @param {string} roomId - The room ID
 * @param {string} userId - The user ID
 * @param {string} userType - 'teacher' or 'student'
 * @returns {Promise<Array>} Array of stroke objects
 */
export const loadStrokes = async (roomId, userId, userType) => {
  try {
    const db = await initDB();
    const storeName = userType === 'teacher' ? TEACHER_STORE : STUDENT_STORE;
    
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index('roomId');
    
    const request = index.getAll(roomId);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const allStrokes = request.result || [];
        // Filter by userId and extract just the stroke objects
        const userStrokes = allStrokes
          .filter(item => item.userId === userId)
          .sort((a, b) => a.timestamp - b.timestamp)
          .map(item => item.stroke);
        
        console.log(`📥 Loaded ${userStrokes.length} ${userType} strokes from IndexedDB`);
        resolve(userStrokes);
      };
      
      request.onerror = () => {
        console.error('Error loading strokes from IndexedDB:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('loadStrokes error:', error);
    return []; // Return empty array on error
  }
};

/**
 * Clear all strokes for a specific user (used on question change)
 * @param {string} roomId - The room ID
 * @param {string} userId - The user ID
 * @param {string} userType - 'teacher' or 'student'
 * @returns {Promise<void>}
 */
export const clearStrokes = async (roomId, userId, userType) => {
  try {
    const db = await initDB();
    const storeName = userType === 'teacher' ? TEACHER_STORE : STUDENT_STORE;
    
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const index = store.index('roomId');
    
    const request = index.openCursor(roomId);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          // Only delete if it matches the userId
          if (cursor.value.userId === userId) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          console.log(`🗑️ Cleared ${userType} strokes from IndexedDB for room ${roomId}`);
          resolve();
        }
      };
      
      request.onerror = () => {
        console.error('Error clearing strokes from IndexedDB:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('clearStrokes error:', error);
    throw error;
  }
};

/**
 * Clear all data from IndexedDB (useful for debugging)
 * @returns {Promise<void>}
 */
export const clearAllData = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction([TEACHER_STORE, STUDENT_STORE], 'readwrite');
    
    const teacherStore = transaction.objectStore(TEACHER_STORE);
    const studentStore = transaction.objectStore(STUDENT_STORE);
    
    await Promise.all([
      new Promise((resolve) => {
        teacherStore.clear().onsuccess = resolve;
      }),
      new Promise((resolve) => {
        studentStore.clear().onsuccess = resolve;
      })
    ]);
    
    console.log('🗑️ Cleared all IndexedDB data');
  } catch (error) {
    console.error('clearAllData error:', error);
    throw error;
  }
};

