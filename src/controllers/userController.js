import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { logAction } from '../services/actionLogService.js';

// @desc    Get all users (Admin only)
// @route   GET /api/v1/users
// @access  Private/Admin
export const listUsers = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search || ''; // Search by name or email

    const whereClause = {
        // Exclude the current admin from the list if desired, or other system users
        // id: { not: req.user.id },
        OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { email: { contains: searchTerm, mode: 'insensitive' } },
        ],
    };

    const users = await prisma.user.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { // Select only necessary fields
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
            updatedAt: true,
        }
    });

    const totalUsers = await prisma.user.count({ where: whereClause });

    res.json(new ApiResponse(200, {
        data: users,
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
        totalItems: totalUsers,
        itemsPerPage: limit
    }, "Users fetched successfully"));
});

// @desc    Delete user (Admin only)
// @route   DELETE /api/v1/users/:id
// @access  Private/Admin
export const deleteUser = asyncHandler(async (req, res) => {
    const userIdToDelete = req.params.id;

    if (userIdToDelete === req.user.id) {
        res.status(400);
        throw new Error("Admin cannot delete their own account through this endpoint.");
    }

    const user = await prisma.user.findUnique({
        where: { id: userIdToDelete },
    });

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    // Add any cleanup logic here if necessary (e.g., reassigning resources, nullifying relations)
    // For now, Prisma's cascade rules (if defined) or simple deletion.
    // Be careful with cascading deletes of vehicles, requests etc. Consider soft delete or archiving.
    // For this example, we'll proceed with a hard delete.

    await prisma.actionLog.deleteMany({ where: { userId: userIdToDelete }});
    await prisma.slotRequest.deleteMany({ where: { userId: userIdToDelete }});
    await prisma.vehicle.deleteMany({ where: { userId: userIdToDelete }}); // This will delete user's vehicles too
    // If vehicles or requests should be preserved, you need a different strategy.

    await prisma.user.delete({
        where: { id: userIdToDelete },
    });

    await logAction('USER_DELETED_BY_ADMIN', req.user.id, { deletedUserId: userIdToDelete, deletedUserEmail: user.email });
    res.json(new ApiResponse(200, null, 'User deleted successfully'));
});

// @desc    Get user by ID (Admin only)
// @route   GET /api/v1/users/:id
// @access  Private/Admin
export const getUserById = asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            vehicles: { select: { id: true, plateNumber: true, vehicleType: true } },
            slotRequests: { select: { id: true, requestStatus: true, createdAt: true } }
        }
    });

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }
    res.json(new ApiResponse(200, user, "User details fetched successfully"));
});