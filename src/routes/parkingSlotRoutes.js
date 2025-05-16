import express from 'express';
import {
    bulkCreateSlots,
    createSlot,
    listSlots,
    getSlotById,
    updateSlot,
    deleteSlot
} from '../controllers/parkingSlotController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Publicly accessible (for users) or admin (for all) - handled by controller logic + protect
router.get('/', protect, listSlots);      // GET /api/v1/parking-slots - Users see available, Admins see all/filtered
router.get('/:id', protect, getSlotById); // GET /api/v1/parking-slots/:id - Users/Admins view specific slot

// Admin only routes for creating, updating, and deleting slots
router.post('/bulk', protect, authorize('ADMIN'), bulkCreateSlots); // POST /api/v1/parking-slots/bulk - Admin bulk creates slots
router.post('/', protect, authorize('ADMIN'), createSlot);         // POST /api/v1/parking-slots - Admin creates a single slot
router.put('/:id', protect, authorize('ADMIN'), updateSlot);       // PUT /api/v1/parking-slots/:id - Admin updates a slot
router.delete('/:id', protect, authorize('ADMIN'), deleteSlot);   // DELETE /api/v1/parking-slots/:id - Admin deletes a slot

export default router;