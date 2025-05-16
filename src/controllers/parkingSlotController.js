import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { logAction } from '../services/actionLogService.js';

// @desc    Bulk create parking slots (Admin only)
// @route   POST /api/v1/parking-slots/bulk
// @access  Private/Admin
export const bulkCreateSlots = asyncHandler(async (req, res) => {
    const { slots } = req.body; // Expecting an array of slot objects [{ slotNumber, size, vehicleType, location }, ...]

    if (!Array.isArray(slots) || slots.length === 0) {
        res.status(400);
        throw new Error('Slots array is required and cannot be empty.');
    }

    const createdSlots = [];
    const errors = [];

    for (const slotData of slots) {
        if (!slotData.slotNumber || !slotData.size || !slotData.vehicleType || !slotData.location) {
            errors.push({ slotData, error: 'Missing required fields (slotNumber, size, vehicleType, location)' });
            continue;
        }
        if (typeof slotData.slotNumber !== 'string' || typeof slotData.size !== 'string' || typeof slotData.vehicleType !== 'string' || typeof slotData.location !== 'string') {
            errors.push({ slotData, error: 'Invalid data types for slot fields.'});
            continue;
        }
        try {
            const existingSlot = await prisma.parkingSlot.findUnique({ where: { slotNumber: slotData.slotNumber }});
            if (existingSlot) {
                errors.push({ slotData, error: `Slot number ${slotData.slotNumber} already exists.` });
                continue;
            }
            const newSlot = await prisma.parkingSlot.create({
                data: {
                    slotNumber: slotData.slotNumber,
                    size: slotData.size,
                    vehicleType: slotData.vehicleType,
                    location: slotData.location,
                    status: 'AVAILABLE', // Default
                },
            });
            createdSlots.push(newSlot);
        } catch (error) {
            errors.push({ slotData, error: error.message });
        }
    }

    await logAction('SLOTS_BULK_CREATED', req.user.id, { createdCount: createdSlots.length, errorCount: errors.length });

    if (errors.length > 0) {
        return res.status(207).json(new ApiResponse(207, // Multi-Status
            { createdSlots, errors },
            `Bulk operation partially successful. ${createdSlots.length} slots created, ${errors.length} failed.`
        ));
    }

    res.status(201).json(new ApiResponse(201, createdSlots, `${createdSlots.length} slots created successfully.`));
});


// @desc    Create a single parking slot (Admin only)
// @route   POST /api/v1/parking-slots
// @access  Private/Admin
export const createSlot = asyncHandler(async (req, res) => {
    const { slotNumber, size, vehicleType, location } = req.body;

    if (!slotNumber || !size || !vehicleType || !location) {
        res.status(400);
        throw new Error('Slot number, size, vehicle type, and location are required.');
    }
    if (typeof slotNumber !== 'string' || typeof size !== 'string' || typeof vehicleType !== 'string' || typeof location !== 'string') {
        res.status(400);
        throw new Error('Invalid data types for slot fields.');
    }

    const existingSlot = await prisma.parkingSlot.findUnique({ where: { slotNumber }});
    if (existingSlot) {
        res.status(400);
        throw new Error(`Slot number ${slotNumber} already exists.`);
    }

    const slot = await prisma.parkingSlot.create({
        data: {
            slotNumber,
            size,
            vehicleType,
            location,
            status: 'AVAILABLE',
        },
    });
    await logAction('SLOT_CREATED', req.user.id, { slotId: slot.id, slotNumber: slot.slotNumber });
    res.status(201).json(new ApiResponse(201, slot, 'Parking slot created successfully'));
});


// @desc    List all parking slots (Admin - all, Users - available only)
// @route   GET /api/v1/parking-slots
// @access  Private
export const listSlots = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchTerm = (req.query.search || '').toLowerCase(); 
    const statusFilter = req.query.status; // Optional: 'AVAILABLE', 'UNAVAILABLE'

    let whereClause = {
        OR: [
            { slotNumber: { contains: searchTerm,} },
            { vehicleType: { contains: searchTerm,} },
            { size: { contains: searchTerm,} },
            { location: { contains: searchTerm,} },
        ],
    };

    if (req.user.role === 'USER') {
        whereClause.status = 'AVAILABLE'; // Users only see available slots
    } else if (req.user.role === 'ADMIN' && statusFilter) {
        if (['AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE'].includes(statusFilter.toUpperCase())) {
            whereClause.status = statusFilter.toUpperCase();
        }
    }


    const slots = await prisma.parkingSlot.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { slotNumber: 'asc' }, // Or createdAt: 'desc'
    });

    const totalSlots = await prisma.parkingSlot.count({ where: whereClause });

    res.json(new ApiResponse(200, {
        data: slots,
        currentPage: page,
        totalPages: Math.ceil(totalSlots / limit),
        totalItems: totalSlots,
        itemsPerPage: limit
    }, "Parking slots fetched successfully"));
});

// @desc    Get a specific parking slot by ID
// @route   GET /api/v1/parking-slots/:id
// @access  Private
export const getSlotById = asyncHandler(async (req, res) => {
    const slotId = req.params.id;
    const slot = await prisma.parkingSlot.findUnique({
        where: { id: slotId },
    });

    if (!slot) {
        res.status(404);
        throw new Error('Parking slot not found');
    }

    // Users can only see details of available slots if they fetch by ID directly
    // or if they are an admin. ListSlots already filters by 'AVAILABLE' for users.
    if (req.user.role === 'USER' && slot.status !== 'AVAILABLE') {
        // Optional: If you want to restrict users from seeing non-available slots even by ID
        // res.status(403);
        // throw new Error('Slot is not available for viewing.');
    }

    await logAction('SLOT_VIEWED', req.user.id, { slotId: slot.id });
    res.json(new ApiResponse(200, slot, "Parking slot details fetched"));
});

// @desc    Update a parking slot (Admin only)
// @route   PUT /api/v1/parking-slots/:id
// @access  Private/Admin
export const updateSlot = asyncHandler(async (req, res) => {
    const slotId = req.params.id;
    const { slotNumber, size, vehicleType, location, status } = req.body;

    // Basic Validation
    if (slotNumber && typeof slotNumber !== 'string') throw new Error('Invalid slot number');
    if (size && typeof size !== 'string') throw new Error('Invalid size');
    if (vehicleType && typeof vehicleType !== 'string') throw new Error('Invalid vehicle type');
    if (location && typeof location !== 'string') throw new Error('Invalid location');
    if (status && !['AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE'].includes(status)) {
        res.status(400);
        throw new Error('Invalid status value. Must be AVAILABLE, UNAVAILABLE, or MAINTENANCE.');
    }

    const slot = await prisma.parkingSlot.findUnique({
        where: { id: slotId },
    });

    if (!slot) {
        res.status(404);
        throw new Error('Parking slot not found');
    }

    if (slotNumber && slotNumber !== slot.slotNumber) {
        const existingSlot = await prisma.parkingSlot.findUnique({ where: { slotNumber }});
        if (existingSlot) {
            res.status(400);
            throw new Error(`Slot number ${slotNumber} already taken.`);
        }
    }

    const updatedSlot = await prisma.parkingSlot.update({
        where: { id: slotId },
        data: {
            slotNumber: slotNumber || slot.slotNumber,
            size: size || slot.size,
            vehicleType: vehicleType || slot.vehicleType,
            location: location || slot.location,
            status: status || slot.status,
        },
    });

    await logAction('SLOT_UPDATED', req.user.id, { slotId: updatedSlot.id });
    res.json(new ApiResponse(200, updatedSlot, 'Parking slot updated successfully'));
});


// @desc    Delete a parking slot (Admin only)
// @route   DELETE /api/v1/parking-slots/:id
// @access  Private/Admin
export const deleteSlot = asyncHandler(async (req, res) => {
    const slotId = req.params.id;

    const slot = await prisma.parkingSlot.findUnique({
        where: { id: slotId },
    });

    if (!slot) {
        res.status(404);
        throw new Error('Parking slot not found');
    }

    // Check if the slot is currently assigned or has pending requests
    if (slot.status === 'UNAVAILABLE') {
        const request = await prisma.slotRequest.findFirst({
            where: { slotId: slotId, requestStatus: 'APPROVED' }
        });
        if (request) {
            res.status(400);
            throw new Error('Cannot delete slot. It is currently assigned to an approved request. Resolve the request first.');
        }
    }
    const pendingRequests = await prisma.slotRequest.count({
        where: { slotId: slotId, requestStatus: 'PENDING' }
    });
    if (pendingRequests > 0) {
        res.status(400);
        throw new Error('Cannot delete slot. There are pending requests associated with it.');
    }


    await prisma.parkingSlot.delete({
        where: { id: slotId },
    });

    await logAction('SLOT_DELETED', req.user.id, { slotId, slotNumber: slot.slotNumber });
    res.json(new ApiResponse(200, null, 'Parking slot deleted successfully'));
});