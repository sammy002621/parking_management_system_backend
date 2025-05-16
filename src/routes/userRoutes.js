import express from 'express';
import {
    listUsers,
    deleteUser,
    getUserById
} from '../controllers/userController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All user management routes are admin-only
router.use(protect);        // First, ensure the user is authenticated
router.use(authorize('ADMIN')); // Then, ensure the user has the 'ADMIN' role

router.route('/')
    .get(listUsers); // GET /api/v1/users - List all users (paginated, searchable)

router.route('/:id')
    .get(getUserById)   // GET /api/v1/users/:id - Get a specific user by ID
    .delete(deleteUser); // DELETE /api/v1/users/:id - Delete a user

export default router;