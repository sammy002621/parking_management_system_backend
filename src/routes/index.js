import express from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import vehicleRoutes from './vehicleRoutes.js';
import parkingSlotRoutes from './parkingSlotRoutes.js';
import slotRequestRoutes from './slotRequestRoutes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes); // For admin to manage users
router.use('/vehicles', vehicleRoutes);
router.use('/parking-slots', parkingSlotRoutes);
router.use('/slot-requests', slotRequestRoutes);

export default router;