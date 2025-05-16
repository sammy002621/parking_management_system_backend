import express from 'express';
import {
    createSlotRequest,
    listSlotRequests,
    getSlotRequestById,
    updateSlotRequest,    // User updates their PENDING request
    cancelSlotRequest,    // User cancels their PENDING request
    approveRequest,       // Admin approves a request
    rejectRequest         // Admin rejects a request
} from '../controllers/slotRequestController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect); // All slot request routes require login

router.route('/')
    .post(authorize('USER'), createSlotRequest) // POST /api/v1/slot-requests - Only users can create requests
    .get(listSlotRequests);                     // GET /api/v1/slot-requests - Users see their own, Admins see all (paginated, searchable)

router.route('/:id')
    .get(getSlotRequestById)                     // GET /api/v1/slot-requests/:id - User sees own, Admin sees any
    .put(authorize('USER'), updateSlotRequest);  // PUT /api/v1/slot-requests/:id - User updates their PENDING request (e.g., change vehicle)

router.patch('/:id/cancel', authorize('USER'), cancelSlotRequest); // PATCH /api/v1/slot-requests/:id/cancel - User cancels their PENDING request

// Admin actions for approving/rejecting requests
router.patch('/:requestId/approve', authorize('ADMIN'), approveRequest); // PATCH /api/v1/slot-requests/:requestId/approve
router.patch('/:requestId/reject', authorize('ADMIN'), rejectRequest);   // PATCH /api/v1/slot-requests/:requestId/reject

export default router;