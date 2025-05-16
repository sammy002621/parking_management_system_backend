import express from 'express';
import { addVehicle, listUserVehicles, getVehicleById, updateVehicle, deleteVehicle } from '../controllers/vehicleController.js'; // Assume these are created
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.route('/')
    .post(protect, addVehicle) // All logged-in users can add
    .get(protect, listUserVehicles); // Users see their own vehicles

router.route('/:id')
    .get(protect, getVehicleById) // Logic in controller to check ownership
    .put(protect, updateVehicle) // Logic in controller to check ownership
    .delete(protect, deleteVehicle); // Logic in controller to check ownership

export default router;