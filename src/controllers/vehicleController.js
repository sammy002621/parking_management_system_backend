import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { logAction } from '../services/actionLogService.js';

// Add Vehicle (from previous response)
export const addVehicle = asyncHandler(async (req, res) => {
  const { plateNumber, vehicleType, size, otherAttributes } = req.body;
  const userId = req.user.id;

  if (!plateNumber || !vehicleType || !size) {
    res.status(400);
    throw new Error('Plate number, vehicle type, and size are required.');
  }
  if (typeof plateNumber !== 'string' || typeof vehicleType !== 'string' || typeof size !== 'string') {
      res.status(400);
      throw new Error('Invalid data types for plate number, vehicle type, or size.');
  }

  const existingVehicle = await prisma.vehicle.findUnique({ where: { plateNumber } });
  if (existingVehicle) {
    res.status(400);
    throw new Error('Vehicle with this plate number already exists.');
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      plateNumber,
      vehicleType,
      size,
      otherAttributes: otherAttributes || {},
      userId,
    },
  });

  await logAction('VEHICLE_ADDED', userId, { vehicleId: vehicle.id, plateNumber });
  res.status(201).json(new ApiResponse(201, vehicle, 'Vehicle added successfully'));
  // call the controller to ask a parking slot
});

// List User's Vehicles (from previous response)
export const listUserVehicles = asyncHandler(async (req, res) => {
  const userId = req.body.id || req.user.id; 
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const searchTerm = (req.query.search || '').toLowerCase();

  if(!userId){
    res.status(400);
    throw new Error('User ID is required');
  }

  const whereClause = {
    userId,
    OR: [
      { 
        plateNumber: 
        { contains: searchTerm } },
      { 
        vehicleType: 
        { contains: searchTerm } },
    ],
  };

  const vehicles = await prisma.vehicle.findMany({
    where: whereClause,
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  const totalVehicles = await prisma.vehicle.count({ where: whereClause });

  res.json(new ApiResponse(200, {
    data: vehicles,
    currentPage: page,
    totalPages: Math.ceil(totalVehicles / limit),
    totalItems: totalVehicles,
    itemsPerPage: limit
  }, "User's vehicles fetched successfully"));
});

// @desc    Get a specific vehicle by ID
// @route   GET /api/v1/vehicles/:id
// @access  Private (Owner or Admin)
export const getVehicleById = asyncHandler(async (req, res) => {
    const vehicleId = req.params.id;
    const vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
    });

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    // Check ownership or if admin
    if (vehicle.userId !== req.user.id && req.user.role !== 'ADMIN') {
        res.status(403);
        throw new Error('Not authorized to view this vehicle');
    }

    await logAction('VEHICLE_VIEWED', req.user.id, { vehicleId: vehicle.id });
    res.json(new ApiResponse(200, vehicle, "Vehicle details fetched"));
});


// @desc    Update a vehicle
// @route   PUT /api/v1/vehicles/:id
// @access  Private (Owner only)
export const updateVehicle = asyncHandler(async (req, res) => {
    const vehicleId = req.params.id;
    const { vehicleType, size, otherAttributes } = req.body; // Plate number is unique, typically not updated.

    // Basic Validation
    if (vehicleType && typeof vehicleType !== 'string') throw new Error('Invalid vehicle type');
    if (size && typeof size !== 'string') throw new Error('Invalid size');

    const vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
    });

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    if (vehicle.userId !== req.user.id) {
        res.status(403);
        throw new Error('Not authorized to update this vehicle');
    }

    // Cannot update plateNumber via this route, handle separately if needed
    const updatedVehicle = await prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
            vehicleType: vehicleType || vehicle.vehicleType,
            size: size || vehicle.size,
            otherAttributes: otherAttributes !== undefined ? otherAttributes : vehicle.otherAttributes,
        },
    });

    await logAction('VEHICLE_UPDATED', req.user.id, { vehicleId: updatedVehicle.id });
    res.json(new ApiResponse(200, updatedVehicle, 'Vehicle updated successfully'));
});

// @desc    Delete a vehicle
// @route   DELETE /api/v1/vehicles/:id
// @access  Private (Owner only)
export const deleteVehicle = asyncHandler(async (req, res) => {
    const vehicleId = req.params.id;

    const vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
    });

    if (!vehicle) {
        res.status(404);
        throw new Error('Vehicle not found');
    }

    if (vehicle.userId !== req.user.id) {
        res.status(403);
        throw new Error('Not authorized to delete this vehicle');
    }

    // Check for pending or approved slot requests associated with this vehicle
    const activeRequests = await prisma.slotRequest.count({
        where: {
            vehicleId: vehicleId,
            requestStatus: { in: ['PENDING', 'APPROVED'] }
        }
    });

    if (activeRequests > 0) {
        res.status(400);
        throw new Error('Cannot delete vehicle with active or approved parking requests. Please cancel/resolve them first.');
    }

    await prisma.vehicle.delete({
        where: { id: vehicleId },
    });

    await logAction('VEHICLE_DELETED', req.user.id, { vehicleId, plateNumber: vehicle.plateNumber });
    res.json(new ApiResponse(200, null, 'Vehicle deleted successfully'));
});