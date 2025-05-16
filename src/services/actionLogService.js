import prisma from '../config/db.js';

export const logAction = async (action, userId = null, details = null) => {
  try {
    await prisma.actionLog.create({
      data: {
        action,
        userId: userId,
        details: details || undefined, // Prisma handles null for optional Json
      },
    });
  } catch (error) {
    console.error('Failed to log action:', error);
    // Decide if this error should propagate or be silently handled
  }
};