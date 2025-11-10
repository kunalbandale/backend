import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { UserModel } from '../models/User';
import { ContactModel } from '../models/Contact';
import { TemplateModel } from '../models/Template';
import { MessageLogModel } from '../models/MessageLog';
import { DepartmentModel } from '../models/Department';
import { BulkOperationModel } from '../models/BulkOperation';
import { SectionPDFModel } from '../models/SectionPDF';
import { AdminLogModel } from '../models/AdminLog';
import { getBulkOperationsByUser, getBulkOperationsByDepartment } from '../services/bulkMessaging';
import { logUserCreation, logUserUpdate, logUserDeletion, logSectionCreation, logSectionUpdate, logSectionDeletion } from '../utils/adminLogger';
import fs from 'fs';
import path from 'path';

const router = Router();

// Public routes (accessible to both ADMIN and CLERK)
router.get('/departments', async (req, res) => {
  try {
    // Get departments from database only
    const dbDepartments = await DepartmentModel.find({ isActive: true }).sort({ name: 1 });
    res.json(dbDepartments);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to read departments', details: String(error) });
  }
});

// Get section PDFs for clerks to select and send (from SectionPDF collection)
router.get('/sections/:departmentCode/pdfs', async (req, res) => {
  try {
    const { departmentCode } = req.params;
    
    // Validate department exists
    const dept = await DepartmentModel.findOne({ 
      $or: [
        { code: departmentCode.toUpperCase() },
        { name: departmentCode }
      ]
    });
    
    if (!dept) {
      return res.status(404).json({ error: 'Department not found' });
    }

    // Get PDFs from SectionPDF collection for this department with UPLOADED status
    const pdfs = await SectionPDFModel.find({
      department: departmentCode.toUpperCase(),
      status: 'UPLOADED'
    }).select('filename originalName mobileNumber fileSize mimeType uploadedByName createdAt').sort({ createdAt: -1 });

    // Format the response
    const files = pdfs.map(pdf => ({
      id: pdf._id,
      name: pdf.filename,
      originalName: pdf.originalName,
      size: pdf.fileSize,
      type: pdf.mimeType,
      department: departmentCode.toUpperCase(),
      uploadedAt: (pdf as any).createdAt || new Date(),
      recipient: pdf.mobileNumber,
      uploadedBy: pdf.uploadedByName
    }));

    res.json(files);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to read section PDFs', details: String(error) });
  }
});

// Get all section PDFs for a user (all statuses) - for logs
router.get('/sections/:departmentCode/logs', async (req, res) => {
  try {
    const { departmentCode } = req.params;
    
    // Validate department exists
    const dept = await DepartmentModel.findOne({ 
      $or: [
        { code: departmentCode.toUpperCase() },
        { name: departmentCode }
      ]
    });
    
    if (!dept) {
      return res.status(404).json({ error: 'Department not found' });
    }

    // Get all PDFs from SectionPDF collection for this department (all statuses)
    const pdfs = await SectionPDFModel.find({
      department: departmentCode
    }).select('filename originalName mobileNumber fileSize mimeType uploadedByName status sentAt sentByName createdAt').sort({ createdAt: -1 });

    // Format the response
    const files = pdfs.map(pdf => ({
      id: pdf._id,
      name: pdf.filename,
      originalName: pdf.originalName,
      size: pdf.fileSize,
      type: pdf.mimeType,
      department: departmentCode,
      uploadedAt: (pdf as any).createdAt || new Date(),
      recipient: pdf.mobileNumber,
      uploadedBy: pdf.uploadedByName,
      status: pdf.status,
      sentAt: pdf.sentAt,
      sentBy: pdf.sentByName
    }));

    res.json(files);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to read section logs', details: String(error) });
  }
});

// Get files from department (from database)
router.get('/departments/:code/files', async (req, res) => {
  try {
    const { code } = req.params;
    console.log('🔍 Looking for PDFs in department:', code.toUpperCase());
    
    // Get PDFs from database for this department
    console.log('🔍 Querying for department:', code.toUpperCase());
    console.log('🔍 Query conditions:', { 
      department: code.toUpperCase(),
      status: 'UPLOADED'
    });
    
    const pdfs = await SectionPDFModel.find({ 
      department: code.toUpperCase(),
      status: 'UPLOADED' // Only get unsent PDFs
    }).sort({ createdAt: -1 });
    
    console.log('🔍 Raw query result:', pdfs.length, 'PDFs found');

    console.log('📄 Found PDFs:', pdfs.length);
    pdfs.forEach((pdf, index) => {
      console.log(`  ${index + 1}. ${pdf.filename} (${pdf.status})`);
    });

    // Format the response
    const files = pdfs.map(pdf => ({
      id: pdf._id,
      name: pdf.filename,
      originalName: pdf.originalName,
      size: pdf.fileSize,
      type: pdf.mimeType,
      department: code,
      uploadedAt: (pdf as any).createdAt || new Date(),
      recipient: pdf.mobileNumber,
      uploadedBy: pdf.uploadedByName
    }));

    console.log('📤 Returning files:', files.length);
    res.json(files);
  } catch (error: any) {
    console.error('❌ Error getting department files:', error);
    res.status(500).json({ error: 'Failed to read department files', details: String(error) });
  }
});

// Get all pending files across all departments (consolidated endpoint)
router.get('/all-pending-files', async (req, res) => {
  try {
    console.log('🔍 Fetching all pending files across all departments');
    
    // Get all active departments
    const departments = await DepartmentModel.find({ isActive: true }).sort({ name: 1 });
    
    // Get pending files for all departments in parallel
    const pendingFiles: { [key: string]: any[] } = {};
    
    for (const dept of departments) {
      try {
        // Get PDFs from SectionPDF collection for this department with UPLOADED status
        const pdfs = await SectionPDFModel.find({
          department: dept.code,
          status: 'UPLOADED'
        }).sort({ _id: -1 }); // Sort by creation time (newest first)

        // Convert to FileInfo format
        const fileInfos = pdfs.map(pdf => ({
          id: pdf._id,
          name: pdf.filename,
          path: '', // Not needed for frontend
          size: pdf.fileSize,
          type: 'application/pdf',
          uploadedAt: (pdf as any).createdAt || new Date(),
          uploadedBy: pdf.uploadedBy
        }));

        pendingFiles[dept.code] = fileInfos;
        console.log(`📁 Found ${fileInfos.length} pending files for ${dept.code}`);
      } catch (error) {
        console.error(`❌ Error fetching files for ${dept.code}:`, error);
        pendingFiles[dept.code] = [];
      }
    }
    
    console.log(`✅ Total departments processed: ${departments.length}`);
    res.json(pendingFiles);
  } catch (error: any) {
    console.error('❌ Error fetching all pending files:', error);
    res.status(500).json({ error: 'Failed to fetch pending files', details: String(error) });
  }
});

// Serve PDF file for download (from database)
router.get('/departments/:code/files/:filename', async (req, res) => {
  try {
    const { code, filename } = req.params;
    
    console.log('🔍 PDF fetch request:', { code, filename });
    
    // Find the PDF in database
    const pdf = await SectionPDFModel.findOne({ 
      department: code.toUpperCase(),
      filename: filename,
      status: 'UPLOADED'
    });
    
    console.log('🔍 PDF found in DB:', pdf ? 'YES' : 'NO');
    if (pdf) {
      console.log('🔍 PDF details:', { 
        filename: pdf.filename, 
        department: pdf.department, 
        status: pdf.status 
      });
    }
    
    if (!pdf) {
      console.log('❌ PDF not found in database');
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Convert base64 data back to buffer
    const pdfBuffer = Buffer.from(pdf.pdfData, 'base64');
    
    // Set appropriate headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    // Send the PDF data
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error serving PDF file:', error);
    res.status(500).json({ error: 'Failed to serve PDF file', details: String(error) });
  }
});

// Protected routes (ADMIN only)
router.use(requireAuth, requireRole('ADMIN'));

// Users CRUD (ADMIN can manage all users)
const userSchema = z.object({ 
  email: z.string().email(), 
  password: z.string().min(6), 
  role: z.enum(['ADMIN', 'CLERK', 'SECTION']),
  department: z.string().optional(),
  fullName: z.string().optional(),
  username: z.string().optional()
});

router.post('/users', requireAuth, requireRole('ADMIN'), async (req: any, res) => {
  const parsed = userSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  // Check if email already exists
  const existingUser = await UserModel.findOne({ email: parsed.data.email });
  if (existingUser) {
    return res.status(409).json({ error: 'Email already exists' });
  }
  
  // Check if username already exists (if provided)
  if (parsed.data.username) {
    const existingUsername = await UserModel.findOne({ username: parsed.data.username });
    if (existingUsername) {
      return res.status(409).json({ error: 'Username already exists' });
    }
  }
  
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.default.hash(parsed.data.password, 10);
  const user = await UserModel.create({ 
    email: parsed.data.email, 
    passwordHash, 
    role: parsed.data.role,
    department: parsed.data.department,
    fullName: parsed.data.fullName,
    username: parsed.data.username
  });

  // Log the user creation activity
  const performedBy = req.user?.fullName || req.user?.email || 'Admin';
  const performedById = req.user?.userId || req.user?.id;
  await logUserCreation(user, performedBy, performedById);

  res.status(201).json({ 
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
});

router.get('/users', async (_req, res) => {
  const users = await UserModel.find({}, { 
    _id: 1,
    email: 1, 
    role: 1, 
    department: 1, 
    fullName: 1, 
    username: 1, 
    isActive: 1, 
    lastLogin: 1, 
    createdAt: 1, 
    updatedAt: 1 
  }).sort({ createdAt: -1 });
  res.json(users);
});

router.put('/users/:id', requireAuth, requireRole('ADMIN'), async (req: any, res) => {
  const parsed = userSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  // Get the original user data for logging
  const originalUser = await UserModel.findById(req.params.id);
  if (!originalUser) return res.status(404).json({ error: 'User not found' });
  
  const updateData: any = { ...parsed.data };
  
  // If password is being updated, hash it
  if (updateData.password) {
    const bcrypt = await import('bcryptjs');
    updateData.passwordHash = await bcrypt.default.hash(updateData.password, 10);
    delete updateData.password;
  }
  
  const user = await UserModel.findByIdAndUpdate(req.params.id, updateData, { new: true });
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  // Log the user update activity
  const performedBy = req.user?.fullName || req.user?.email || 'Admin';
  const performedById = req.user?.userId || req.user?.id;
  await logUserUpdate(user, performedBy, performedById, updateData);

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
});

router.delete('/users/:id', requireAuth, requireRole('ADMIN'), async (req: any, res) => {
  // Get the user data before deletion for logging
  const user = await UserModel.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  await UserModel.findByIdAndDelete(req.params.id);
  
  // Log the user deletion activity
  const performedBy = req.user?.fullName || req.user?.email || 'Admin';
  const performedById = req.user?.userId || req.user?.id;
  await logUserDeletion(user, performedBy, performedById);
  
  res.status(204).end();
});

// Section Management
const sectionSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(10),
  description: z.string().optional()
});

router.post('/sections', requireAuth, requireRole('ADMIN'), async (req: any, res) => {
  const parsed = sectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  try {
    const section = await DepartmentModel.create({
      ...parsed.data,
      code: parsed.data.code.toUpperCase(),
      isActive: true
    });
    
    // Log the section creation activity
    const performedBy = req.user?.fullName || req.user?.email || 'Admin';
    const performedById = req.user?.userId || req.user?.id;
    await logSectionCreation(section, performedBy, performedById);
    
    res.status(201).json(section);
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Section with this name or code already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create section' });
    }
  }
});

router.get('/sections', async (req, res) => {
  try {
    const sections = await DepartmentModel.find({ isActive: true }).sort({ name: 1 });
    res.json(sections);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch sections' });
  }
});

router.put('/sections/:id', requireAuth, requireRole('ADMIN'), async (req: any, res) => {
  const parsed = sectionSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  try {
    // Get the original section data for logging
    const originalSection = await DepartmentModel.findById(req.params.id);
    if (!originalSection) return res.status(404).json({ error: 'Section not found' });
    
    const updateData = { ...parsed.data };
    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase();
    }
    
    const section = await DepartmentModel.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!section) return res.status(404).json({ error: 'Section not found' });
    
    // Log the section update activity
    const performedBy = req.user?.fullName || req.user?.email || 'Admin';
    const performedById = req.user?.userId || req.user?.id;
    await logSectionUpdate(section, performedBy, performedById, updateData);
    
    res.json(section);
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Section with this name or code already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update section' });
    }
  }
});

router.delete('/sections/:id', requireAuth, requireRole('ADMIN'), async (req: any, res) => {
  try {
    // Get the section data before deletion for logging
    const section = await DepartmentModel.findById(req.params.id);
    if (!section) return res.status(404).json({ error: 'Section not found' });
    
    await DepartmentModel.findByIdAndUpdate(req.params.id, { isActive: false });
    
    // Log the section deletion activity
    const performedBy = req.user?.fullName || req.user?.email || 'Admin';
    const performedById = req.user?.userId || req.user?.id;
    await logSectionDeletion(section, performedBy, performedById);
    
    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

// Contacts CRUD
const contactSchema = z.object({ name: z.string().min(1), phone: z.string().min(8), tags: z.array(z.string()).optional() });
router.post('/contacts', async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const contact = await ContactModel.create(parsed.data);
  res.status(201).json(contact);
});

router.get('/contacts', async (_req, res) => {
  const contacts = await ContactModel.find();
  res.json(contacts);
});

router.put('/contacts/:id', async (req, res) => {
  const parsed = contactSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await ContactModel.findByIdAndUpdate(req.params.id, parsed.data, { new: true });
  res.json(updated);
});

router.delete('/contacts/:id', async (req, res) => {
  await ContactModel.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

// Templates CRUD
const templateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['TEXT', 'IMAGE', 'DOCUMENT']),
  body: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  caption: z.string().optional(),
});

router.post('/templates', async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const created = await TemplateModel.create(parsed.data);
  res.status(201).json(created);
});

router.get('/templates', async (_req, res) => {
  const items = await TemplateModel.find();
  res.json(items);
});

router.put('/templates/:id', async (req, res) => {
  const parsed = templateSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await TemplateModel.findByIdAndUpdate(req.params.id, parsed.data, { new: true });
  res.json(updated);
});

router.delete('/templates/:id', async (req, res) => {
  await TemplateModel.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

// Departments CRUD
const departmentSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(10),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true)
});

router.post('/departments', async (req, res) => {
  const parsed = departmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  try {
    const department = await DepartmentModel.create({
      ...parsed.data,
      code: parsed.data.code.toUpperCase()
    });
    res.status(201).json(department);
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Department with this name or code already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create department' });
    }
  }
});

router.get('/departments', async (req, res) => {
  const { active } = req.query;
  const filter: any = {};
  
  if (active !== undefined) {
    filter.isActive = active === 'true';
  }
  
  const departments = await DepartmentModel.find(filter).sort({ name: 1 });
  res.json(departments);
});

router.get('/departments/:id', async (req, res) => {
  const department = await DepartmentModel.findById(req.params.id);
  if (!department) return res.status(404).json({ error: 'Department not found' });
  res.json(department);
});

router.put('/departments/:id', async (req, res) => {
  const parsed = departmentSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  try {
    const updateData = { ...parsed.data };
    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase();
    }
    
    const updated = await DepartmentModel.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true }
    );
    
    if (!updated) return res.status(404).json({ error: 'Department not found' });
    res.json(updated);
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Department with this name or code already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update department' });
    }
  }
});

router.delete('/departments/:id', async (req, res) => {
  const department = await DepartmentModel.findById(req.params.id);
  if (!department) return res.status(404).json({ error: 'Department not found' });
  
  // Check if department is being used in message logs
  const usageCount = await MessageLogModel.countDocuments({ department: department.code });
  if (usageCount > 0) {
    return res.status(400).json({ 
      error: 'Cannot delete department', 
      message: `Department is being used in ${usageCount} message logs. Consider deactivating instead.` 
    });
  }
  
  await DepartmentModel.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

// Toggle department active status
router.patch('/departments/:id/toggle', async (req, res) => {
  const department = await DepartmentModel.findById(req.params.id);
  if (!department) return res.status(404).json({ error: 'Department not found' });
  
  department.isActive = !department.isActive;
  await department.save();
  
  res.json(department);
});

// Logs and reporting
const logsQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(), // YYYY-MM
  department: z.string().optional(),
  type: z.enum(['TEXT', 'IMAGE', 'DOCUMENT', 'TEMPLATE']).optional(),
  status: z.enum(['QUEUED', 'SENT', 'FAILED', 'DELIVERED', 'READ']).optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(200).default(50),
});

// Simple message logs route for frontend
router.get('/message-logs', async (req, res) => {
  try {
    const { department } = req.query;
    
    let query: any = {};
    if (department) {
      query.department = department;
    }
    
    const logs = await MessageLogModel.find(query)
      .populate('sentBy', 'email role fullName username')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch message logs', details: String(error) });
  }
});

router.get('/logs', async (req, res) => {
  const parsed = logsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { startDate, endDate, month, department, type, status, page, pageSize } = parsed.data;
  const filter: any = {};
  if (department) filter.department = department;
  if (type) filter.type = type;
  if (status) filter.status = status;

  if (month) {
    const [y, m] = month.split('-').map((v) => Number(v));
    const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    filter.createdAt = { $gte: from, $lte: to };
  } else if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    MessageLogModel.find(filter)
      .populate('sentBy', 'email role fullName username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize),
    MessageLogModel.countDocuments(filter),
  ]);

  res.json({ items, total, page, pageSize });
});

router.get('/reports/documents/success', async (req, res) => {
  const q = z
    .object({
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
      department: z.string().optional(),
    })
    .safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.flatten() });

  const { month, department } = q.data;
  const filter: any = { type: 'DOCUMENT', status: 'SENT' };
  if (department) filter.department = department;
  if (month) {
    const [y, m] = month.split('-').map((v) => Number(v));
    const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    filter.createdAt = { $gte: from, $lte: to };
  }

  const docs = await MessageLogModel.find(filter).sort({ createdAt: -1 });
  res.json({ count: docs.length, items: docs });
});

// Dedicated route to list DOCUMENT logs with filters
router.get('/logs/documents', async (req, res) => {
  const q = z
    .object({
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      department: z.string().optional(),
      status: z.enum(['QUEUED', 'SENT', 'FAILED', 'DELIVERED', 'READ']).optional(),
      page: z.coerce.number().min(1).default(1),
      pageSize: z.coerce.number().min(1).max(200).default(50),
      sort: z.enum(['asc', 'desc']).optional().default('desc'),
    })
    .safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.flatten() });

  const { month, startDate, endDate, department, status, page, pageSize, sort } = q.data;
  const filter: any = { type: 'DOCUMENT' };
  if (department) filter.department = department;
  if (status) filter.status = status;

  if (month) {
    const [y, m] = month.split('-').map((v) => Number(v));
    const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    filter.createdAt = { $gte: from, $lte: to };
  } else if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const skip = (page - 1) * pageSize;
  const sortOrder = sort === 'asc' ? 1 : -1;
  const [items, total] = await Promise.all([
    MessageLogModel.find(filter)
      .populate('sentBy', 'email role fullName username')
      .sort({ createdAt: sortOrder })
      .skip(skip)
      .limit(pageSize),
    MessageLogModel.countDocuments(filter),
  ]);

  res.json({ items, total, page, pageSize });
});

// Admin Activity Logs
router.get('/admin-logs', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { search, limit = 50 } = req.query;
    
    // Build filter for database query
    const filter: any = {};
    
    if (search) {
      const searchTerm = (search as string).toLowerCase();
      filter.$or = [
        { action: { $regex: searchTerm, $options: 'i' } },
        { performedBy: { $regex: searchTerm, $options: 'i' } },
        { details: { $regex: searchTerm, $options: 'i' } }
      ];
    }

    // Query the AdminLog collection
    const logs = await AdminLogModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string))
      .lean();

    // Format the response
    const formattedLogs = logs.map(log => ({
      id: log._id.toString(),
      timestamp: log.createdAt.toISOString(),
      action: log.action,
      type: log.type,
      performedBy: log.performedBy,
      details: log.details
    }));

    res.json({
      logs: formattedLogs,
      total: logs.length
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch admin logs', details: String(error) });
  }
});

// Bulk Operations Management
router.get('/bulk-operations', async (req, res) => {
  const { page = 1, pageSize = 20, department, status, userId } = req.query;
  
  const filter: any = {};
  if (department) filter.department = department;
  if (status) filter.status = status;
  if (userId) filter.sentBy = userId;
  
  const skip = (Number(page) - 1) * Number(pageSize);
  
  const [operations, total] = await Promise.all([
    BulkOperationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(pageSize))
      .populate('sentBy', 'email role'),
    BulkOperationModel.countDocuments(filter)
  ]);
  
  res.json({ operations, total, page: Number(page), pageSize: Number(pageSize) });
});

router.get('/bulk-operations/:id', async (req, res) => {
  const operation = await BulkOperationModel.findById(req.params.id)
    .populate('sentBy', 'email role');
  
  if (!operation) {
    return res.status(404).json({ error: 'Bulk operation not found' });
  }
  
  res.json(operation);
});

router.get('/bulk-operations/user/:userId', async (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const result = await getBulkOperationsByUser(req.params.userId, Number(page), Number(pageSize));
  res.json(result);
});

router.get('/bulk-operations/department/:department', async (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const result = await getBulkOperationsByDepartment(req.params.department, Number(page), Number(pageSize));
  res.json(result);
});

// Get bulk operation statistics
router.get('/bulk-operations/stats/summary', async (req, res) => {
  const { startDate, endDate, department } = req.query;
  
  const filter: any = {};
  if (department) filter.department = department;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate as string);
    if (endDate) filter.createdAt.$lte = new Date(endDate as string);
  }
  
  const stats = await BulkOperationModel.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalOperations: { $sum: 1 },
        totalRecipients: { $sum: '$totalRecipients' },
        totalProcessed: { $sum: '$processedCount' },
        totalSuccess: { $sum: '$successCount' },
        totalFailed: { $sum: '$failedCount' },
        avgSuccessRate: { $avg: { $divide: ['$successCount', '$totalRecipients'] } }
      }
    }
  ]);
  
  const statusBreakdown = await BulkOperationModel.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const departmentBreakdown = await BulkOperationModel.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$department',
        count: { $sum: 1 },
        totalRecipients: { $sum: '$totalRecipients' },
        successCount: { $sum: '$successCount' },
        failedCount: { $sum: '$failedCount' }
      }
    }
  ]);
  
  res.json({
    summary: stats[0] || {
      totalOperations: 0,
      totalRecipients: 0,
      totalProcessed: 0,
      totalSuccess: 0,
      totalFailed: 0,
      avgSuccessRate: 0
    },
    statusBreakdown,
    departmentBreakdown
  });
});

// WhatsApp Settings Management
const whatsappSettingsSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  phoneNumberId: z.string().min(1, 'Phone number ID is required')
});

// Get current WhatsApp settings
router.get('/whatsapp-settings', async (req, res) => {
  try {
    res.json({
      accessToken: process.env.WA_ACCESS_TOKEN || '',
      phoneNumberId: process.env.WA_PHONE_NUMBER_ID || ''
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get WhatsApp settings', details: String(error) });
  }
});

// Update WhatsApp settings
router.put('/whatsapp-settings', async (req, res) => {
  try {
    const parsed = whatsappSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { accessToken, phoneNumberId } = parsed.data;
    
    // Update environment variables
    process.env.WA_ACCESS_TOKEN = accessToken;
    process.env.WA_PHONE_NUMBER_ID = phoneNumberId;

    // Update .env file
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    
    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    } else {
      // Create default .env content if file doesn't exist
      envContent = `# Database Configuration
MONGODB_URI=mongodb://localhost:27017/wa_backend

# JWT Configuration
JWT_SECRET=dev_secret_change_me
JWT_EXPIRES_IN=1d

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:4000,http://localhost:5173

# WhatsApp API Configuration
WA_ACCESS_TOKEN=replace
WA_PHONE_NUMBER_ID=replace
WA_BASE_URL=https://graph.facebook.com/
WA_API_VERSION=v22.0

# Server Configuration
NODE_ENV=development
PORT=4000
`;
    }

    // Update or add the WhatsApp settings
    const lines = envContent.split('\n');
    let updated = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('WA_ACCESS_TOKEN=')) {
        lines[i] = `WA_ACCESS_TOKEN=${accessToken}`;
        updated = true;
      } else if (lines[i].startsWith('WA_PHONE_NUMBER_ID=')) {
        lines[i] = `WA_PHONE_NUMBER_ID=${phoneNumberId}`;
        updated = true;
      }
    }
    
    // If the variables weren't found, add them
    if (!updated) {
      lines.push(`WA_ACCESS_TOKEN=${accessToken}`);
      lines.push(`WA_PHONE_NUMBER_ID=${phoneNumberId}`);
    }
    
    // Write the updated content back to .env file
    fs.writeFileSync(envPath, lines.join('\n'));

    res.json({ 
      message: 'WhatsApp settings updated successfully',
      accessToken: accessToken,
      phoneNumberId: phoneNumberId
    });
  } catch (error: any) {
    console.error('Error updating WhatsApp settings:', error);
    res.status(500).json({ error: 'Failed to update WhatsApp settings', details: String(error) });
  }
});

export default router;
