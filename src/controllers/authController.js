import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { hashPassword, comparePassword } from '../utils/passwordUtil.js';
import jwt from 'jsonwebtoken';
import { logAction } from '../services/actionLogService.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};
// the admin is a one person 

export const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Please add all fields');
  }

  const userExists = await prisma.user.findUnique({ where: { email } });
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  const hashedPassword = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      // role is USER by default based on schema
    },
  });

  if (user) {
    await logAction('USER_REGISTERED', user.id, { email: user.email });
    res.status(201).json(new ApiResponse(201, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user.id),
    }, "User registered successfully"));
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });

  if (user && (await comparePassword(password, user.password))) {
    await logAction('USER_LOGIN_SUCCESS', user.id, { email: user.email });
    res.json(new ApiResponse(200, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user.id),
    }, "Login successful"));
  } else {
    await logAction('USER_LOGIN_FAILED', null, { email });
    res.status(401);
    throw new Error('Invalid email or password');
  }
});

export const getMe = asyncHandler(async (req, res) => {
  // req.user is populated by the protect middleware
  res.json(new ApiResponse(200, req.user));
});

export const updateUserProfile = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const userId = req.user.id;

  const user = await prisma.user.findUnique({ where: { id: userId }});

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const updateData = {};
  if (name) updateData.name = name;
  if (email) {
    const emailExists = await prisma.user.findFirst({ where: { email, NOT: { id: userId }}});
    if (emailExists) {
        res.status(400);
        throw new Error("Email already taken by another user");
    }
    updateData.email = email;
  }
  if (password) {
    updateData.password = await hashPassword(password);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: { id: true, name: true, email: true, role: true }
  });

  await logAction('USER_PROFILE_UPDATED', userId);
  res.json(new ApiResponse(200, updatedUser, "Profile updated successfully"));
});