import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UserModel } from '../models/User';
import { signJwt } from '../utils/jwt';
import { logAdminActivity } from '../utils/adminLogger';
import { requireAuth } from '../middleware/auth';

const router = Router();
console.log('Auth routes:');
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'CLERK', 'SECTION']),
  department: z.string().optional(),
});

router.post('/register', async (req, res) => {
  console.log('Registering user:', req.body);
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, role, department } = parsed.data;
  const existing = await UserModel.findOne({ email });
  if (existing) return res.status(409).json({ error: 'Email already exists' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await UserModel.create({ email, passwordHash, role, department });
  const token = signJwt({ userId: user.id, role: user.role, department: user.department });
  res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role, department: user.department } });
});

const loginSchema = z.object({ 
  email: z.string().email(), 
  password: z.string().min(1),
  role: z.enum(['ADMIN', 'CLERK', 'SECTION']).optional(),
  department: z.string().optional()
});

router.post('/login', async (req, res) => {
  try {
    console.log('=== LOGIN REQUEST RECEIVED ===');
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);
    
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      console.log('Validation error:', parsed.error.flatten());
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    
    const { email, password, role, department } = parsed.data;
    console.log('Logging in user:', email);
    
    const user = await UserModel.findOne({ email });
    console.log('User found:', user ? 'Yes' : 'No');
    console.log('User details:', user ? { id: user.id, email: user.email, role: user.role, department: user.department } : 'Not found');
    
    if (!user) {
      console.log('User not found, returning 401');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Validate role-based login
    if (role && user.role !== role) {
      console.log('Role mismatch:', { provided: role, actual: user.role });
      return res.status(401).json({ error: 'Invalid role selected. Please select the correct role.' });
    }
    
    // For SECTION role users, validate department
    if (user.role === 'SECTION') {
      if (!department) {
        return res.status(400).json({ error: 'Please select your section to login.' });
      }
      if (user.department !== department) {
        console.log('Department mismatch:', { provided: department, actual: user.department });
        return res.status(401).json({ error: 'Invalid section selected. Please select the correct section for your account.' });
      }
    }
    
    console.log('Comparing password...');
    const ok = await user.comparePassword(password);
    console.log('Password match:', ok);
    
    if (!ok) {
      console.log('Password mismatch, returning 401');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Log admin login activity
    if (user.role === 'ADMIN') {
      await logAdminActivity({
        action: 'Admin Login',
        type: 'LOGIN',
        performedBy: user.fullName || user.email,
        performedById: user.id,
        details: `Admin logged in`
      });
    }
    
    console.log('Generating token...');
    const token = signJwt({ userId: user.id, role: user.role, department: user.department });
    console.log('Token generated, sending response');
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        role: user.role, 
        department: user.department,
        fullName: user.fullName,
        username: user.username,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      } 
    });
    console.log('=== LOGIN REQUEST COMPLETED ===');
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await UserModel.findById(req.user?.userId).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      department: user.department,
      fullName: user.fullName,
      username: user.username,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;