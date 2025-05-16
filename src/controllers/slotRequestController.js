import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { logAction } from '../services/actionLogService.js';
import { sendEmail } from '../config/mailer.js'; // Assuming sendEmail is correctly set up

// @desc    Create a parking slot request (User)
// @route   POST /api/v1/slot-requests
// @access  Private/User
export const createSlotRequest = asyncHandler(async (req, res) => {
    const { vehicleId } = req.body;
    const userId = req.user.id;

    if (!vehicleId || typeof vehicleId !== 'string') {
        res.status(400);
        throw new Error('Vehicle ID is required and must be a string.');
    }

    const vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
    });

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found.');
    }
    if (vehicle.userId !== userId) {
        res.status(403);
        throw new Error('You can only request slots for your own vehicles.');
    }

    // Check if there's already an active (pending/approved) request for this vehicle
    const existingRequest = await prisma.slotRequest.findFirst({
        where: {
            vehicleId,
            requestStatus: { in: ['PENDING', 'APPROVED'] },
        },
    });

    if (existingRequest) {
        res.status(400);
        throw new Error(`An active slot request (Status: ${existingRequest.requestStatus}) already exists for this vehicle.`);
    }

    const slotRequest = await prisma.slotRequest.create({
        data: {
            userId,
            vehicleId,
            requestStatus: 'PENDING',
        },
    });

    await logAction('SLOT_REQUEST_CREATED', userId, { requestId: slotRequest.id, vehicleId });
    // Optional: Notify admins about new request
    res.status(201).json(new ApiResponse(201, slotRequest, 'Slot request created successfully. Awaiting admin approval.'));
});

// @desc    List slot requests (User: their own, Admin: all)
// @route   GET /api/v1/slot-requests
// @access  Private
export const listSlotRequests = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { status, search } = req.query; // search by vehicle plate or user email (admin)

    let whereClause = {};
    if (req.user.role === 'USER') {
        whereClause.userId = req.user.id;
    }

    if (status && ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status.toUpperCase())) {
        whereClause.requestStatus = status.toUpperCase();
    }

    if (search) {
        if (req.user.role === 'ADMIN') {
            whereClause.OR = [
                { vehicle: { plateNumber: { contains: search, mode: 'insensitive' } } },
                { user: { email: { contains: search, mode: 'insensitive' } } },
                { user: { name: { contains: search, mode: 'insensitive' } } },
            ];
        } else { // User search is limited to their vehicle's plate number
            whereClause.AND = [
                ...(whereClause.AND || []), // Preserve existing user ID filter
                { vehicle: { plateNumber: { contains: search, mode: 'insensitive' } } }
            ];
        }
    }


    const slotRequests = await prisma.slotRequest.findMany({
        where: whereClause,
        include: {
            vehicle: { select: { id: true, plateNumber: true, vehicleType: true, size: true } },
            user: { select: { id: true, name: true, email: true } }, // Included for admin view
            slot: { select: { id: true, slotNumber: true, location: true } } // Included if assigned
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
    });

    const totalRequests = await prisma.slotRequest.count({ where: whereClause });

    res.json(new ApiResponse(200, {
        data: slotRequests,
        currentPage: page,
        totalPages: Math.ceil(totalRequests / limit),
        totalItems: totalRequests,
        itemsPerPage: limit
    }, "Slot requests fetched successfully"));
});


// @desc    Get a specific slot request by ID
// @route   GET /api/v1/slot-requests/:id
// @access  Private (Owner or Admin)
export const getSlotRequestById = asyncHandler(async (req, res) => {
    const requestId = req.params.id;
    const slotRequest = await prisma.slotRequest.findUnique({
        where: { id: requestId },
        include: {
            vehicle: true,
            user: { select: { id: true, name: true, email: true } },
            slot: true
        }
    });

    if (!slotRequest) {
        res.status(404);
        throw new Error('Slot request not found');
    }

    if (req.user.role === 'USER' && slotRequest.userId !== req.user.id) {
        res.status(403);
        throw new Error('Not authorized to view this slot request');
    }

    await logAction('SLOT_REQUEST_VIEWED', req.user.id, { requestId });
    res.json(new ApiResponse(200, slotRequest, "Slot request details fetched"));
});


// @desc    Update a PENDING slot request (User - e.g., change vehicle)
// @route   PUT /api/v1/slot-requests/:id
// @access  Private/User
export const updateSlotRequest = asyncHandler(async (req, res) => {
    const requestId = req.params.id;
    const { vehicleId } = req.body; // Only allow changing vehicle for a PENDING request by user
    const userId = req.user.id;

    if (!vehicleId || typeof vehicleId !== 'string') {
        res.status(400);
        throw new Error('New Vehicle ID is required.');
    }

    const slotRequest = await prisma.slotRequest.findUnique({
        where: { id: requestId },
    });

    if (!slotRequest) {
        res.status(404);
        throw new Error('Slot request not found.');
    }
    if (slotRequest.userId !== userId) {
        res.status(403);
        throw new Error('Not authorized to update this slot request.');
    }
    if (slotRequest.requestStatus !== 'PENDING') {
        res.status(400);
        throw new Error(`Cannot update request. Status is already ${slotRequest.requestStatus}.`);
    }

    const newVehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }});
    if (!newVehicle || newVehicle.userId !== userId) {
        res.status(400);
        throw new Error('Invalid or unauthorized vehicle ID provided for update.');
    }

    // Check if there's already an active (pending/approved) request for THIS NEW vehicle
    if (newVehicle.id !== slotRequest.vehicleId) { 
        const existingRequestForNewVehicle = await prisma.slotRequest.findFirst({
            where: {
                vehicleId: newVehicle.id,
                requestStatus: { in: ['PENDING', 'APPROVED'] },
                NOT: { id: requestId } // Exclude the current request being updated
            },
        });
        if (existingRequestForNewVehicle) {
            res.status(400);
            throw new Error(`An active slot request already exists for the new vehicle (Plate: ${newVehicle.plateNumber}).`);
        }
    }


    const updatedRequest = await prisma.slotRequest.update({
        where: { id: requestId },
        data: { vehicleId },
    });

    await logAction('SLOT_REQUEST_UPDATED_BY_USER', userId, { requestId, newVehicleId: vehicleId });
    res.json(new ApiResponse(200, updatedRequest, 'Slot request updated successfully.'));
});


// @desc    Cancel a PENDING slot request (User)
// @route   PATCH /api/v1/slot-requests/:id/cancel
// @access  Private/User
export const cancelSlotRequest = asyncHandler(async (req, res) => {
    const requestId = req.params.id;
    const userId = req.user.id;

    const slotRequest = await prisma.slotRequest.findUnique({
        where: { id: requestId },
    });

    if (!slotRequest) {
        res.status(404);
        throw new Error('Slot request not found.');
    }
    if (slotRequest.userId !== userId) {
        res.status(403);
        throw new Error('Not authorized to cancel this slot request.');
    }
    if (slotRequest.requestStatus !== 'PENDING') {
        res.status(400);
        throw new Error(`Cannot cancel request. Status is already ${slotRequest.requestStatus}.`);
    }

    const cancelledRequest = await prisma.slotRequest.update({
        where: { id: requestId },
        data: { requestStatus: 'CANCELLED' },
    });

    await logAction('SLOT_REQUEST_CANCELLED_BY_USER', userId, { requestId });
    res.json(new ApiResponse(200, cancelledRequest, 'Slot request cancelled successfully.'));
});


// @desc    Approve a slot request (Admin) 
// @route   PATCH /api/v1/slot-requests/:requestId/approve
// @access  Private/Admin- (from previous response, slightly adapted)
export const approveRequest = asyncHandler(
    async (req, res) => {
    const { requestId } = req.params;
    const { slotId: manuallyAssignedSlotId } = req.body; // Optional: Admin manual assignment

    const slotRequest = await prisma.slotRequest.findUnique({
        where: { id: requestId },
        include: { vehicle: true, user: true },
    });

    if (!slotRequest) {
        res.status(404);
        throw new Error('Slot request not found');
    }
    if (slotRequest.requestStatus !== 'PENDING') {
        res.status(400);
        throw new Error(`Request already ${slotRequest.requestStatus.toLowerCase()}`);
    }

    let assignedSlot;
    if (manuallyAssignedSlotId) {
        if (typeof manuallyAssignedSlotId !== 'string') {
            res.status(400);
            throw new Error('Invalid Slot ID format');
        }
        assignedSlot = await prisma.parkingSlot.findFirst({
            where: {
                id: manuallyAssignedSlotId,
                status: 'AVAILABLE',
                // Basic compatibility check, admin should be aware
                size: slotRequest.vehicle.size,
                OR: [
                    { vehicleType: slotRequest.vehicle.vehicleType },
                    { vehicleType: { equals: 'any', mode: 'insensitive' } }
                ]
            }
        });
        if (!assignedSlot) {
            res.status(400);
            throw new Error('Manually assigned slot is not available or not compatible.');
        }
    } else {
        // Automatic Slot Assignment Logic
        assignedSlot = await prisma.parkingSlot.findFirst({
            where: {
                status: 'AVAILABLE',
                size: slotRequest.vehicle.size,
                OR: [
                    { vehicleType: slotRequest.vehicle.vehicleType },
                    { vehicleType: { equals: 'any', mode: 'insensitive' } }
                ]
            },
            orderBy: { createdAt: 'asc' }, // Example: oldest available
        });
    }

    if (!assignedSlot) {
        res.status(400);
        throw new Error('No compatible parking slot available for this vehicle.');
    }

    const updatedRequest = await prisma.slotRequest.update({
        where: { id: requestId },
        data: {
            requestStatus: 'APPROVED',
            slotId: assignedSlot.id,
            assignedSlotNumber: assignedSlot.slotNumber,
            approvedAt: new Date(),
        },
    });

    await prisma.parkingSlot.update({
        where: { id: assignedSlot.id },
        data: { status: 'UNAVAILABLE' },
    });

    await logAction('SLOT_REQUEST_APPROVED', req.user.id, { requestId, vehicleId: slotRequest.vehicleId, slotId: assignedSlot.id });

    const emailHtml = `...`; // Email HTML (from previous example)
    try {
        await sendEmail(slotRequest.user.email, 'Parking Slot Approved!', emailHtml); // Make sure email subject and body are good
    } catch (emailError) {
        console.error("Failed to send approval email:", emailError);
    }

    res.json(new ApiResponse(200, updatedRequest, 'Slot request approved and slot assigned.'));
});

// @desc    Reject a slot request (Admin)
// @route   PATCH /api/v1/slot-requests/:requestId/reject
// @access  Private/Admin
export const rejectRequest = asyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { rejectionReason } = req.body; // Optional reason

    const slotRequest = await prisma.slotRequest.findUnique({
        where: { id: requestId },
        include: { user: true, vehicle: true }
    });

    if (!slotRequest) {
        res.status(404);
        throw new Error('Slot request not found');
    }
    if (slotRequest.requestStatus !== 'PENDING') {
        res.status(400);
        throw new Error(`Request is already ${slotRequest.requestStatus.toLowerCase()}. Cannot reject.`);
    }

    const rejectedRequest = await prisma.slotRequest.update({
        where: { id: requestId },
        data: {
            requestStatus: 'REJECTED',
            // Store rejectionReason if your schema supports it (e.g., in a 'remarks' or 'details' field)
        },
    });

    await logAction('SLOT_REQUEST_REJECTED', req.user.id, { requestId, vehicleId: slotRequest.vehicleId, reason: rejectionReason });

    // Send email notification for rejection
    const emailHtml = `
        <h1>Parking Slot Request Rejected</h1>
        <p>Dear ${slotRequest.user.name},</p>
        <p>We regret to inform you that your parking slot request for vehicle <strong>${slotRequest.vehicle.plateNumber}</strong> has been rejected.</p>
        ${rejectionReason ? `<p><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
        <p>Please contact support if you have any questions.</p>
        <p>Thank you.</p>
    `;
    try {
        await sendEmail(slotRequest.user.email, 'Parking Slot Request Rejected', emailHtml);
    } catch (emailError) {
        console.error("Failed to send rejection email:", emailError);
    }

    res.json(new ApiResponse(200, rejectedRequest, 'Slot request rejected.'));
});