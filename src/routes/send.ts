import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, validateDepartment } from '../middleware/auth';
import { sendText, sendImage, sendDocument, sendTemplate, uploadImage, sendBulkText, createTemplate, uploadMediaFromStream, sendDocumentByMediaId } from '../services/whatsapp';
import { MessageLogModel } from '../models/MessageLog';
import { DepartmentModel } from '../models/Department';
import { BulkOperationModel } from '../models/BulkOperation';
import { SectionPDFModel } from '../models/SectionPDF';
import { UserModel } from '../models/User';
import { parseCSVBuffer } from '../services/csvProcessor';
import { processBulkMessage, getBulkOperationStatus } from '../services/bulkMessaging';
import { logMessageSent, logFileUpload } from '../utils/adminLogger';
import { asyncHandler, AppError, ValidationError, WhatsAppAPIError, DatabaseError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { Request } from 'express';

// Utility function to delete PDF file from department folder
async function deletePDFFromDepartment(departmentCode: string, filename: string): Promise<boolean> {
  try {
    const folderName = `Department_${departmentCode.replace('D', '')}`;
    const filePath = path.join(process.cwd(), 'Departments', folderName, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted PDF file: ${filename} from ${folderName}`);
      return true;
    } else {
      console.log(`⚠️ PDF file not found: ${filename} in ${folderName}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error deleting PDF file ${filename}:`, error);
    return false;
  }
}

// Utility function to delete PDF from database after successful send
async function deletePDFFromDatabase(pdfId: string): Promise<boolean> {
  try {
    const result = await SectionPDFModel.findByIdAndDelete(pdfId);
    if (result) {
      console.log(`🗑️ Deleted PDF from database: ${result.filename}`);
      return true;
    } else {
      console.log(`⚠️ PDF not found in database: ${pdfId}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error deleting PDF from database ${pdfId}:`, error);
    return false;
  }
}

// Utility function to delete CSV file from uploads folder
async function deleteCSVFile(filename: string): Promise<boolean> {
  try {
    const filePath = path.join(process.cwd(), 'uploads', filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted CSV file: ${filename}`);
      return true;
    } else {
      console.log(`⚠️ CSV file not found: ${filename}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error deleting CSV file ${filename}:`, error);
    return false;
  }
}

// Extend Request interface to include multer file
interface MulterRequest extends Request {
  file?: any;
}

const router = Router();

// Require authentication for all send routes
router.use(requireAuth);

// Configure multer for memory uploads (CSV and PDF)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const isCsv = file.mimetype === 'text/csv' || file.originalname.endsWith('.csv');
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf');
    if (isCsv || isPdf) return cb(null, true);
    cb(new Error('Only CSV or PDF files are allowed'));
  }
});

// Configure multer for handling both files and form data
const uploadWithFormData = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const isCsv = file.mimetype === 'text/csv' || file.originalname.endsWith('.csv');
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf');
    const isDoc = file.mimetype === 'application/msword' || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (isCsv || isPdf || isDoc) return cb(null, true);
    cb(new Error('Only CSV, PDF, or DOC files are allowed'));
  }
});

// Custom middleware to handle form data parsing
const handleFormData = (req: any, res: any, next: any) => {
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    // Let multer handle the parsing
    next();
  } else {
    next();
  }
};

// Alternative approach: Use multer.none() for text fields and handle files separately
const uploadTextOnly = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req: any, file: any, cb: any) => {
    // Only allow text fields, no files
    cb(new Error('No files allowed in this middleware'));
  }
});

// Custom middleware to manually parse form data
const parseFormDataManually = (req: any, res: any, next: any) => {
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    // If req.body is empty, try to parse from the raw request
    if (!req.body || Object.keys(req.body).length === 0) {
      console.log('⚠️  req.body is empty, attempting manual parsing...');
      
      // For now, let's use default values for testing
      req.body = {
        operationName: req.body.operationName || 'Default Operation',
        caption: req.body.caption || 'Default Caption',
        department: req.body.department || 'Department 1'
      };
      
      console.log('Using default values:', req.body);
    }
  }
  next();
};

const textSchema = z.object({ to: z.string().min(8), body: z.string().min(1), department: z.string().min(1).optional() });
router.post('/text', requireRole('CLERK', 'ADMIN'), validateDepartment(), async (req, res) => {
  const parsed = textSchema.safeParse(req.body);
  console.log(parsed);

  console.log("hiii");
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const log = await MessageLogModel.create({ 
    to: parsed.data.to, 
    type: 'TEXT', 
    payload: parsed.data, 
    status: 'QUEUED', 
    department: req.body.validatedDepartment?.code || parsed.data.department, 
    sentBy: req.user?.userId as any 
  });
  try {
    const data = await sendText(parsed.data);
    log.status = 'SENT';
    log.waMessageId = data?.messages?.[0]?.id;
    await log.save();
    res.json({ ok: true, id: log.id, waMessageId: log.waMessageId });
  } catch (e: any) {
    log.status = 'FAILED';
    log.error = e?.response?.data ? JSON.stringify(e.response.data) : String(e);
    await log.save();
    res.status(502).json({ error: 'Failed to send', details: log.error });
  }
});

const imageSchema = z
  .object({
    to: z.string().min(8),
    imageUrl: z.string().url().optional(),
    mediaId: z.string().min(1).optional(),
    caption: z.string().optional(),
  })
  .refine((v) => Boolean(v.imageUrl || v.mediaId), {
    message: 'Provide either imageUrl or mediaId',
    path: ['imageUrl'],
  });
router.post('/media', requireRole('CLERK', 'ADMIN'), validateDepartment(), async (req, res) => {
  const parsed = imageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const log = await MessageLogModel.create({ 
    to: parsed.data.to, 
    type: 'IMAGE', 
    payload: parsed.data, 
    status: 'QUEUED', 
    department: req.body.validatedDepartment?.code || (req.body as any).department, 
    sentBy: req.user?.userId as any 
  });
  try {
    const data = await sendImage(parsed.data);
    log.status = 'SENT';
    log.waMessageId = data?.messages?.[0]?.id;
    await log.save();
    res.json({ ok: true, id: log.id, waMessageId: log.waMessageId });
  } catch (e: any) {
    log.status = 'FAILED';
    log.error = e?.response?.data ? JSON.stringify(e.response.data) : String(e);
    await log.save();
    res.status(502).json({ error: 'Failed to send', details: log.error });
  }
});

const docSchema = z.object({ to: z.string().min(8), documentUrl: z.string().url(), caption: z.string().optional(), department: z.string().min(1).optional() });
router.post('/document', requireRole('CLERK', 'ADMIN'), validateDepartment(), async (req, res) => {
  const parsed = docSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const log = await MessageLogModel.create({ 
    to: parsed.data.to, 
    type: 'DOCUMENT', 
    payload: parsed.data, 
    status: 'QUEUED', 
    department: req.body.validatedDepartment?.code || parsed.data.department, 
    sentBy: req.user?.userId as any 
  });
  try {
    const data = await sendDocument(parsed.data);
    log.status = 'SENT';
    log.waMessageId = data?.messages?.[0]?.id;
    await log.save();
    res.json({ ok: true, id: log.id, waMessageId: log.waMessageId });
  } catch (e: any) {
    log.status = 'FAILED';
    log.error = e?.response?.data ? JSON.stringify(e.response.data) : String(e);
    await log.save();
    res.status(502).json({ error: 'Failed to send', details: log.error });
  }
});

const templateSchema = z.object({ 
  to: z.string().min(8), 
  templateName: z.string().min(1),
  languageCode: z.string().optional().default('en_US'),
  components: z.array(z.object({
    type: z.string(),
    parameters: z.array(z.object({
      type: z.string(),
      text: z.string()
    }))
  })).optional(),
  department: z.string().min(1).optional()
});
router.post('/template', requireRole('CLERK', 'ADMIN'), validateDepartment(), async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const log = await MessageLogModel.create({ 
    to: parsed.data.to, 
    type: 'TEMPLATE', 
    payload: parsed.data, 
    status: 'QUEUED', 
    department: req.body.validatedDepartment?.code || parsed.data.department, 
    sentBy: req.user?.userId as any 
  });
  try {
    const data = await sendTemplate(parsed.data);
    log.status = 'SENT';
    log.waMessageId = data?.messages?.[0]?.id;
    await log.save();
    res.json({ ok: true, id: log.id, waMessageId: log.waMessageId });
  } catch (e: any) {
    log.status = 'FAILED';
    log.error = e?.response?.data ? JSON.stringify(e.response.data) : String(e);
    await log.save();
    res.status(502).json({ error: 'Failed to send', details: log.error });
  }
});

const uploadSchema = z.object({ 
  filePath: z.string().min(1),
  mimeType: z.string().min(1)
});
router.post('/upload', requireRole('CLERK', 'ADMIN'), async (req, res) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const mediaId = await uploadImage(parsed.data.filePath, parsed.data.mimeType);
    res.json({ ok: true, mediaId });
  } catch (e: any) {
    res.status(502).json({ error: 'Failed to upload', details: e.response?.data || String(e) });
  }
});

// Send a template with a single uploaded PDF (field: pdf_file)
router.post('/send-template', requireRole('CLERK', 'ADMIN'), upload.single('pdf_file'), validateDepartment(), async (req: any, res) => {
  try {
    const { to, date, day, templateName } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'PDF file is required under field "pdf_file"' });
    if (!to || !date || !day) return res.status(400).json({ error: 'Fields to, date, day are required' });

    // Upload media to WhatsApp
    const tmpPath = path.join(process.cwd(), 'uploads', `${Date.now()}-${file.originalname || 'upload.pdf'}`);
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, file.buffer);
    const stream = fs.createReadStream(tmpPath);
    const mediaId = await uploadMediaFromStream(stream, 'application/pdf');
    stream.close();
    fs.unlink(tmpPath, () => {});

    // Prepare template payload
    const tplName = templateName || 'YOUR_TEMPLATE_NAME';

    const log = await MessageLogModel.create({
      to,
      type: 'TEMPLATE',
      templateName: tplName,
      payload: { date, day, mediaId, filename: file.originalname },
      status: 'QUEUED',
      department: req.body.validatedDepartment?.code || req.body.department,
      sentBy: req.user?.userId as any
    });

    const data = await sendTemplate({
      to,
      templateName: tplName,
      languageCode: 'en_US',
      // Use header document + body params
      components: [
        {
          type: 'header',
          parameters: [
            { type: 'document', document: { id: mediaId, filename: file.originalname } } as any
          ]
        } as any,
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(date) } as any,
            { type: 'text', text: String(day) } as any
          ]
        } as any
      ] as any
    } as any);

    log.status = 'SENT';
    log.waMessageId = data?.messages?.[0]?.id;
    await log.save();

    return res.json({ ok: true, waMessageId: log.waMessageId, mediaId });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to send template', details: err?.response?.data || String(err) });
  }
});

// Upload a PDF and send a template with document header to one or many recipients
// Accepts multipart/form-data with fields:
// - pdf: single PDF file
// - to: single mobile or comma-separated list; OR csvFile: CSV file with column 'mobile'
// - templateName, date, day, department (optional)
router.post('/template-document', requireRole('CLERK', 'ADMIN'), upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'csvFile', maxCount: 1 }]), validateDepartment(), async (req: any, res) => {
  try {
    const pdfFile = (req.files?.pdf?.[0]);
    if (!pdfFile) return res.status(400).json({ error: 'PDF file is required under field "pdf"' });

    // Upload PDF to WhatsApp to obtain mediaId
    const tmpPath = path.join(process.cwd(), 'uploads', `${Date.now()}-upload.pdf`);
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, pdfFile.buffer);
    const stream = fs.createReadStream(tmpPath);
    const mediaId = await uploadMediaFromStream(stream, 'application/pdf');
    stream.close();
    fs.unlink(tmpPath, () => {});

    // Determine recipients
    let recipients: string[] = [];
    if (req.body.to) {
      recipients = String(req.body.to)
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
    const csvFile = (req.files?.csvFile?.[0]);
    if (csvFile) {
      const csvData = await parseCSVBuffer(csvFile.buffer);
      recipients = recipients.concat(csvData.mobileNumbers);
    }
    recipients = Array.from(new Set(recipients));
    if (recipients.length === 0) return res.status(400).json({ error: 'Provide at least one recipient via to or csvFile' });

    const templateName = req.body.templateName;
    const date = req.body.date;
    const day = req.body.day;
    if (!templateName || !date || !day) {
      return res.status(400).json({ error: 'templateName, date and day are required' });
    }

    const department = req.body.validatedDepartment?.code || req.body.department;

    const results: any[] = [];
    for (const to of recipients) {
      const log = await MessageLogModel.create({
        to,
        type: 'TEMPLATE',
        templateName,
        payload: { templateName, date, day, mediaId },
        status: 'QUEUED',
        department,
        sentBy: req.user?.userId as any
      });
      try {
        const data = await sendTemplate({
          to,
          templateName,
          languageCode: 'en_US',
          components: [
            {
              type: 'header',
              parameters: [
                { type: 'document', text: undefined as any } // placeholder to satisfy types
              ]
            },
            {
              type: 'body',
              parameters: [
                { type: 'text', text: String(date) },
                { type: 'text', text: String(day) }
              ]
            }
          ] as any
        } as any);

        // Fix header parameters to document object using direct call payload shape
        // sendTemplate currently supports text parameters, so alternatively use sendDocument template by crafting components here
        log.status = 'SENT';
        log.waMessageId = data?.messages?.[0]?.id;
        await log.save();
        results.push({ to, status: 'success', id: log.waMessageId });
      } catch (e: any) {
        log.status = 'FAILED';
        log.error = e?.response?.data ? JSON.stringify(e.response.data) : String(e);
        await log.save();
        results.push({ to, status: 'failed', error: log.error });
      }
      await new Promise(r => setTimeout(r, 100));
    }

    res.json({ ok: true, mediaId, count: results.length, results });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to send template with document', details: e.response?.data || String(e) });
  }
});

// Single PDF -> filename is the recipient number (without extension). Example: 919876543210.pdf
// Accept any file field name to avoid "Unexpected field" errors from clients
router.post('/single-pdf', requireRole('CLERK', 'ADMIN'), upload.any(), validateDepartment(), async (req: any, res) => {
  // try {
  //   const files = (req.files || []) as Array<any>;
  //   const pdfFile = files.find(f => f.fieldname === 'pdf') || files[0];
  //   if (!pdfFile) return res.status(400).json({ error: 'PDF file is required (field name "pdf" recommended)' });

  //   // Derive recipient from filename
  //   const original = pdfFile.originalname || 'file.pdf';
  //   const base = path.parse(original).name; // e.g. 919876543210
  //   const to = base.trim();
  //   if (!to) return res.status(400).json({ error: 'Filename must contain recipient number (e.g. 919876543210.pdf)' });

    
  //   const tmpPath = path.join(process.cwd(), 'uploads', `${Date.now()}-${original}`);
  //   fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
  //   fs.writeFileSync(tmpPath, pdfFile.buffer);
  //   const stream = fs.createReadStream(tmpPath);
  //   const mediaId = await uploadMediaFromStream(stream, 'application/pdf');
  //   stream.close();
  //   fs.unlink(tmpPath, () => {});

  //   // Send as document (no template), using mediaId
  //   const department = req.body.validatedDepartment?.code || req.body.department;
  //   const log = await MessageLogModel.create({ 
  //     to, 
  //     type: 'DOCUMENT', 
  //     payload: { mediaId, filename: original }, 
  //     status: 'QUEUED', 
  //     department, 
  //     sentBy: req.user?.userId as any 
  //   });

  //   try {
  //     const data = await sendDocumentByMediaId({ to, mediaId });
  //     log.status = 'SENT';
  //     log.waMessageId = data?.messages?.[0]?.id;
  //     await log.save();
  //     return res.json({ ok: true, id: log.id, waMessageId: log.waMessageId });
  //   } catch (e: any) {
  //     log.status = 'FAILED';
  //     log.error = e?.response?.data ? JSON.stringify(e.response.data) : String(e);
  //     await log.save();
  //     return res.status(502).json({ error: 'Failed to send document', details: log.error });
  //   }
  // } catch (e: any) {
  //   return res.status(500).json({ error: 'Failed to process single PDF send', details: e.response?.data || String(e) });
  // }


  try {
    const files = (req.files || []) as Array<any>;
    const pdfFile = files.find(f => f.fieldname === "pdf") || files[0];

    if (!pdfFile) {
      return res.status(400).json({ error: 'PDF file is required (field name "pdf" recommended)' });
    }

    // Derive recipient from filename (e.g. 919309014869.pdf)
    const original = pdfFile.originalname || "file.pdf";
    const baseName = path.parse(original).name;
    const to = baseName.replace(/\D/g, "").trim(); // ensure only digits

    if (!to) {
      return res.status(400).json({ error: 'Filename must contain recipient number (e.g. 919876543210.pdf)' });
    }

    // Create temp file
    const tmpPath = path.join(process.cwd(), "uploads", `${Date.now()}-${original}`);
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, pdfFile.buffer);

    // Upload to WhatsApp
    const mediaId = await uploadMediaFromStream(fs.createReadStream(tmpPath), "application/pdf");

    // cleanup
    fs.unlink(tmpPath, () => {});

    // Create DB log entry
    const department = req.body.validatedDepartment?.code || req.body.department;
    const log = await MessageLogModel.create({
      to,
      type: "DOCUMENT",
      payload: { mediaId, filename: original },
      status: "QUEUED",
      department,
      sentBy: req.user?.userId as any,
    });

    // Send WhatsApp message
    try {
      const data = await sendDocumentByMediaId({ to, mediaId });
      log.status = "SENT";
      log.waMessageId = data?.messages?.[0]?.id;
      await log.save();

          // Clean up PDF file from department folder after successful sending
          if (department && original) {
            await deletePDFFromDepartment(department, original);
            console.log(`🧹 Cleaned up PDF file for single-pdf message`);
          }

      return res.json({
        ok: true,
        id: log.id,
        waMessageId: log.waMessageId,
      });
    } catch (err: any) {
      log.status = "FAILED";
      log.error = err?.response?.data ? JSON.stringify(err.response.data) : String(err);
      await log.save();
      return res.status(502).json({ error: "Failed to send document", details: log.error });
    }

  } catch (err: any) {
    console.error("Unexpected Error:", err);
    return res.status(500).json({ error: "Failed to process single PDF send", details: err.response?.data || String(err) });
  }

});
const bulkSchema = z.object({ 
  recipients: z.array(z.string().min(8)),
  body: z.string().min(1),
  department: z.string().min(1).optional()
});
router.post('/bulk', requireRole('CLERK', 'ADMIN'), validateDepartment(), async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const results = await sendBulkText(parsed.data.recipients, parsed.data.body);
    // write logs for bulk sends
    const nowLogs = results.map((r: any) => ({
      to: r.to,
      type: 'TEXT',
      payload: { body: parsed.data.body },
      status: r.status === 'success' ? 'SENT' : 'FAILED',
      waMessageId: r.data?.messages?.[0]?.id,
      department: req.body.validatedDepartment?.code || parsed.data.department,
      sentBy: req.user?.userId as any,
      error: r.status === 'failed' ? (typeof r.error === 'string' ? r.error : JSON.stringify(r.error)) : undefined,
    }));
    await MessageLogModel.insertMany(nowLogs);
    res.json({ ok: true, results });
  } catch (e: any) {
    res.status(502).json({ error: 'Failed to send bulk', details: String(e) });
  }
});

const createTemplateSchema = z.object({ 
  templateName: z.string().min(1),
  content: z.string().min(1),
  category: z.string().optional().default('UTILITY')
});
router.post('/create-template', requireRole('ADMIN'), async (req, res) => {
  const parsed = createTemplateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const data = await createTemplate(parsed.data.templateName, parsed.data.content, parsed.data.category);
    res.json({ ok: true, template: data });
  } catch (e: any) {
    res.status(502).json({ error: 'Failed to create template', details: String(e) });
  }
});

// CSV Bulk Messaging Endpoints
const csvBulkTextSchema = z.object({
  operationName: z.string().min(1),
  messageContent: z.string().min(1),
  department: z.string().min(1)
});

// router.post('/csv-bulk-text', upload.single('csvFile'), validateDepartment(), async (req: MulterRequest, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: 'CSV file is required' });
//     }

//     const parsed = csvBulkTextSchema.safeParse(req.body);
//     if (!parsed.success) {
//       return res.status(400).json({ error: parsed.error.flatten() });
//     }

//     // Parse CSV file
//     const csvData = await parseCSVBuffer(req.file.buffer);
    
//     if (csvData.mobileNumbers.length === 0) {
//       return res.status(400).json({ 
//         error: 'No valid mobile numbers found in CSV file',
//         details: csvData.errors 
//       });
//     }

//     // Start bulk messaging process
//     const operationId = await processBulkMessage({
//       type: 'TEXT',
//       messageContent: parsed.data.messageContent,
//       department: req.body.validatedDepartment?.code || parsed.data.department,
//       mobileNumbers: csvData.mobileNumbers,
//       sentBy: req.user?.userId!,
//       operationName: parsed.data.operationName
//     });

//     res.json({
//       ok: true,
//       operationId,
//       message: 'Bulk messaging started',
//       stats: {
//         totalNumbers: csvData.totalRows,
//         validNumbers: csvData.validNumbers,
//         invalidNumbers: csvData.invalidNumbers,
//         errors: csvData.errors
//       }
//     });

//   } catch (error: any) {
//     res.status(500).json({ error: 'Failed to process CSV bulk messaging', details: String(error) });
//   }
// });

// const csvBulkImageSchema = z.object({
//   operationName: z.string().min(1),
//   imageUrl: z.string().url(),
//   caption: z.string().optional(),
//   department: z.string().min(1)
// });

// router.post('/csv-bulk-image', upload.single('csvFile'), validateDepartment(), async (req: MulterRequest, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: 'CSV file is required' });
//     }

//     const parsed = csvBulkImageSchema.safeParse(req.body);
//     if (!parsed.success) {
//       return res.status(400).json({ error: parsed.error.flatten() });
//     }

//     // Parse CSV file
//     const csvData = await parseCSVBuffer(req.file.buffer);
    
//     if (csvData.mobileNumbers.length === 0) {
//       return res.status(400).json({ 
//         error: 'No valid mobile numbers found in CSV file',
//         details: csvData.errors 
//       });
//     }

//     // Start bulk messaging process
//     const operationId = await processBulkMessage({
//       type: 'IMAGE',
//       imageUrl: parsed.data.imageUrl,
//       caption: parsed.data.caption,
//       department: req.body.validatedDepartment?.code || parsed.data.department,
//       mobileNumbers: csvData.mobileNumbers,
//       sentBy: req.user?.userId!,
//       operationName: parsed.data.operationName
//     });

//     res.json({
//       ok: true,
//       operationId,
//       message: 'Bulk image messaging started',
//       stats: {
//         totalNumbers: csvData.totalRows,
//         validNumbers: csvData.validNumbers,
//         invalidNumbers: csvData.invalidNumbers,
//         errors: csvData.errors
//       }
//     });

//   } catch (error: any) {
//     res.status(500).json({ error: 'Failed to process CSV bulk messaging', details: String(error) });
//   }
// });

const csvBulkDocumentSchema = z.object({
  operationName: z.string().min(1).optional(),
  caption: z.string().optional(),
  department: z.string().min(1).optional(),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional()
});

router.post('/csv-bulk-document', requireRole('CLERK', 'ADMIN'), upload.any(), asyncHandler(async (req: any, res: any) => {
  const requestId = req.headers['x-request-id'] as string;
  const userId = req.user?.userId;

  try {
    const files = (req.files || []) as Array<any>;
    const csvFile = files.find(f => f.fieldname === 'csvFile');
    const documentFile = files.find(f => f.fieldname === 'documentFile');

    if (!csvFile) {
      throw new ValidationError('CSV file is required', { field: 'csvFile', message: 'CSV file is required' });
    }

    if (!documentFile) {
      throw new ValidationError('Document file is required', { field: 'documentFile', message: 'Document file is required' });
    }

    logger.info('Starting bulk document processing', {
      requestId,
      userId,
      csvFileName: csvFile.originalname,
      documentFileName: documentFile.originalname,
      csvFileSize: csvFile.size,
      documentFileSize: documentFile.size
    });

    console.log('=== DEBUG INFO ===');
    console.log('Request body:', req.body);
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Request body values:', Object.values(req.body));
    console.log('Files received:', { csvFile: csvFile?.originalname, documentFile: documentFile?.originalname });
    console.log('req.files structure:', req.files);
    console.log('Raw request body type:', typeof req.body);
    console.log('Request body length:', Object.keys(req.body).length);
    console.log('==================');

    // Clean up the request body by trimming field names and values
    const cleanedBody: any = {};
    Object.keys(req.body).forEach(key => {
      const trimmedKey = key.trim();
      const value = req.body[key];
      cleanedBody[trimmedKey] = typeof value === 'string' ? value.trim() : value;
    });
    
    console.log('Cleaned body:', cleanedBody);

    const parsed = csvBulkDocumentSchema.safeParse(cleanedBody);
    if (!parsed.success) {
      console.log('Validation error:', parsed.error.flatten());
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    // Validate department after form data is parsed
    if (parsed.data.department) {
      try {
        const dept = await DepartmentModel.findOne({ 
          $or: [
            { code: parsed.data.department.toUpperCase() },
            { name: parsed.data.department }
          ],
          isActive: true 
        });
        
        if (!dept) {
          return res.status(400).json({ 
            error: 'Invalid department', 
            message: `Department '${parsed.data.department}' is not valid or inactive` 
          });
        }
        
        // Add validated department info for later use
        req.body.validatedDepartment = dept;
      } catch (error) {
        return res.status(500).json({ error: 'Failed to validate department' });
      }
    }

    // Parse CSV file
    let csvData;
    try {
      csvData = await parseCSVBuffer(csvFile.buffer);
    } catch (error) {
      logger.error('CSV parsing failed', error, requestId, userId);
      throw new ValidationError('Invalid CSV file format', { field: 'csvFile', message: 'CSV file could not be parsed' });
    }
    
    if (csvData.mobileNumbers.length === 0) {
      throw new ValidationError('No valid mobile numbers found in CSV file', {
        field: 'csvFile',
        message: 'CSV file must contain valid mobile numbers',
        details: csvData.errors
      });
    }

    // Upload document to WhatsApp to get mediaId
    let tmpPath: string;
    let mediaId: string;
    
    try {
      tmpPath = path.join(process.cwd(), 'uploads', `${Date.now()}-${documentFile.originalname || 'document.pdf'}`);
      fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
      fs.writeFileSync(tmpPath, documentFile.buffer);
      
      const stream = fs.createReadStream(tmpPath);
      mediaId = await uploadMediaFromStream(stream, documentFile.mimetype || 'application/pdf');
      stream.close();
      
      // Clean up temp file
      fs.unlink(tmpPath, (err) => {
        if (err) logger.warn('Failed to delete temp file', err, requestId);
      });
      
      logger.info('Document uploaded to WhatsApp successfully', {
        requestId,
        userId,
        mediaId,
        fileName: documentFile.originalname
      });
    } catch (error) {
      logger.error('WhatsApp upload failed', error, requestId, userId);
      throw new WhatsAppAPIError('Failed to upload document to WhatsApp', error);
    }

    logger.info(`Found ${csvData.mobileNumbers.length} valid mobile numbers in CSV`, {
      requestId,
      userId,
      mobileCount: csvData.mobileNumbers.length
    });

    // Create bulk operation record
    let bulkOperation;
    try {
      bulkOperation = await BulkOperationModel.create({
        name: parsed.data.operationName || `Bulk Document - ${new Date().toISOString()}`,
        type: 'DOCUMENT',
        mediaUrl: mediaId,
        caption: parsed.data.caption,
        department: req.body.validatedDepartment?.code || parsed.data.department || 'DEFAULT',
        totalRecipients: csvData.mobileNumbers.length,
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        status: 'PENDING',
        sentBy: req.user?.userId as any,
        startedAt: new Date()
      });
      
      logger.info('Bulk operation created successfully', {
        requestId,
        userId,
        operationId: bulkOperation._id,
        totalRecipients: csvData.mobileNumbers.length
      });
    } catch (error) {
      logger.error('Failed to create bulk operation', error, requestId, userId);
      throw new DatabaseError('Failed to create bulk operation record');
    }

    // Start processing messages immediately (not in background)
    bulkOperation.status = 'PROCESSING';
    await bulkOperation.save();

    const results = [];
    const department = req.body.validatedDepartment?.code || parsed.data.department;

    console.log(`🚀 Starting parallel processing of ${csvData.mobileNumbers.length} messages...`);

    // Configuration for parallel processing
    const CONCURRENCY_LIMIT = 5; // Process 5 messages concurrently
    const BATCH_SIZE = 10; // Process 10 messages per batch
    const RATE_LIMIT_DELAY = 50; // 50ms delay between batches

    // Process messages in batches for better memory management
    const batches = [];
    for (let i = 0; i < csvData.mobileNumbers.length; i += BATCH_SIZE) {
      batches.push(csvData.mobileNumbers.slice(i, i + BATCH_SIZE));
    }

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} messages)`);

      // Create all message logs for this batch first (bulk insert)
      const messageLogs = batch.map(mobileNumber => ({
        to: mobileNumber,
        type: 'DOCUMENT',
        payload: { 
          mediaId, 
          filename: documentFile.originalname, 
          caption: parsed.data.caption,
          operationId: String(bulkOperation._id)
        },
        status: 'QUEUED',
        department,
        sentBy: req.user?.userId as any
      }));

      const createdLogs = await MessageLogModel.insertMany(messageLogs);

      // Process batch with controlled concurrency
      const concurrencyChunks = [];
      for (let i = 0; i < batch.length; i += CONCURRENCY_LIMIT) {
        concurrencyChunks.push(batch.slice(i, i + CONCURRENCY_LIMIT));
      }

      const bulkUpdates: any[] = [];

      for (const chunk of concurrencyChunks) {
        const promises = chunk.map(async (mobileNumber, index) => {
          const batchIndex = batch.indexOf(mobileNumber);
          const messageLog = createdLogs[batchIndex];
          
          try {
            console.log(`📤 Sending document to ${mobileNumber}`);
            
            const data = await sendDocumentByMediaId({ 
              to: mobileNumber, 
              mediaId
            });
            
            // Prepare bulk update for success
            bulkUpdates.push({
              updateOne: {
                filter: { _id: messageLog._id },
                update: {
                  $set: {
                    status: 'SENT',
                    waMessageId: data?.messages?.[0]?.id,
                    updatedAt: new Date()
                  }
                }
              }
            });

            console.log(`✅ Sent document to ${mobileNumber} - WA ID: ${data?.messages?.[0]?.id}`);
            return { success: true, mobileNumber, waMessageId: data?.messages?.[0]?.id };

          } catch (error: any) {
            console.error(`❌ Failed to send document to ${mobileNumber}:`, error.response?.data || error.message);
            
            // Prepare bulk update for failure
            bulkUpdates.push({
              updateOne: {
                filter: { _id: messageLog._id },
                update: {
                  $set: {
                    status: 'FAILED',
                    error: error?.response?.data ? JSON.stringify(error.response.data) : String(error),
                    updatedAt: new Date()
                  }
                }
              }
            });

            return { success: false, mobileNumber, error: error?.response?.data ? JSON.stringify(error.response.data) : String(error) };
          }
        });

        // Wait for all promises in this chunk to complete
        const chunkResults = await Promise.allSettled(promises);
        
        // Count results
        chunkResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            if (result.value.success) {
              successCount++;
            } else {
              failedCount++;
            }
          } else {
            failedCount++;
            console.error(`❌ Promise rejected for message:`, result.reason);
          }
        });

        // Small delay between concurrency chunks
        if (concurrencyChunks.indexOf(chunk) < concurrencyChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      }

      // Batch update all message logs at once
      if (bulkUpdates.length > 0) {
        try {
          await MessageLogModel.bulkWrite(bulkUpdates);
          console.log(`📊 Batch updated ${bulkUpdates.length} message logs`);
        } catch (error) {
          console.error('❌ Error in batch update:', error);
        }
      }

      processedCount += batch.length;

      // Update bulk operation counters (only save every few batches)
      bulkOperation.processedCount = processedCount;
      bulkOperation.successCount = successCount;
      bulkOperation.failedCount = failedCount;
      
      if (batchIndex % 3 === 0 || batchIndex === batches.length - 1) {
        await bulkOperation.save();
        console.log(`💾 Updated bulk operation: ${processedCount} processed, ${successCount} sent, ${failedCount} failed`);
      }

      console.log(`✅ Batch ${batchIndex + 1} completed: ${batch.length} messages processed`);

      // Rate limiting delay between batches
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
      }
    }

    // Add results to response
    results.push(...csvData.mobileNumbers.map(mobileNumber => ({
      to: mobileNumber,
      status: 'processed' // Will be updated by the bulk operation status
    })));

    // Mark operation as completed
    bulkOperation.status = 'COMPLETED';
    bulkOperation.completedAt = new Date();
    await bulkOperation.save();

    console.log(`🎉 Bulk operation completed: ${bulkOperation.successCount} sent, ${bulkOperation.failedCount} failed`);

    // Clean up files ONLY if all messages were sent successfully
    const deptCode = req.body.validatedDepartment?.code || parsed.data.department;
    
    // Only delete PDF if all messages were sent successfully
    if (bulkOperation.failedCount === 0 && deptCode && documentFile.originalname) {
      await deletePDFFromDepartment(deptCode, documentFile.originalname);
      console.log(`🧹 Cleaned up PDF file for bulk operation (all messages sent successfully)`);
    } else if (bulkOperation.failedCount > 0) {
      console.log(`❌ PDF file NOT deleted due to ${bulkOperation.failedCount} failed sends: ${documentFile.originalname}`);
    }
    
    // Clean up CSV file from uploads folder (always safe to delete)
    if (csvFile.originalname) {
      await deleteCSVFile(csvFile.originalname);
    }

        // Note: Keeping filenames in database for proper display in admin logs

    res.json({
      ok: true,
      operationId: String(bulkOperation._id),
      mediaId,
      message: 'Bulk messaging completed',
      results,
      stats: {
        totalNumbers: csvData.totalRows,
        validNumbers: csvData.validNumbers,
        invalidNumbers: csvData.invalidNumbers,
        processedCount: bulkOperation.processedCount,
        successCount: bulkOperation.successCount,
        failedCount: bulkOperation.failedCount,
        errors: csvData.errors
      }
    });

  } catch (error: any) {
    res.status(500).json({ error: 'Failed to process CSV bulk messaging', details: String(error) });
  }
}));

// Bulk messaging with database PDF - supports PDF ID from database
router.post('/csv-bulk-database-pdf', requireRole('CLERK', 'ADMIN'), upload.single('csvFile'), asyncHandler(async (req: any, res: any) => {
  const requestId = req.headers['x-request-id'] as string;
  const userId = req.user?.userId;
  
  try {
    const { pdfId, department, scheduledDate, scheduledTime } = req.body;
    const csvFile = req.file;
    
    if (!pdfId) {
      return res.status(400).json({ error: 'PDF ID is required' });
    }
    
    if (!csvFile) {
      return res.status(400).json({ error: 'CSV file is required' });
    }
    
    if (!department) {
      return res.status(400).json({ error: 'Department is required' });
    }

    // Validate department
    const dept = await DepartmentModel.findOne({ 
      $or: [
        { code: department.toUpperCase() },
        { name: department }
      ]
    });
    if (!dept) {
      return res.status(400).json({ error: 'Invalid department' });
    }

    // Find the PDF in database
    const sectionPDF = await SectionPDFModel.findOne({ 
      _id: pdfId,
      department: department.toUpperCase(),
      status: 'UPLOADED'
    });
    
    if (!sectionPDF) {
      return res.status(404).json({ error: 'PDF not found or already sent' });
    }

    // Parse CSV file
    const csvData = await parseCSVBuffer(csvFile.buffer);
    if (csvData.mobileNumbers.length === 0) {
      return res.status(400).json({ error: 'No valid mobile numbers found in CSV file' });
    }

    // Convert base64 data back to buffer
    const pdfBuffer = Buffer.from(sectionPDF.pdfData, 'base64');
    
    // Create temporary file for WhatsApp upload
    const tmpPath = path.join(process.cwd(), 'uploads', `${Date.now()}-${sectionPDF.filename}`);
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, pdfBuffer);
    
    try {
      // Upload to WhatsApp
      const stream = fs.createReadStream(tmpPath);
      const mediaId = await uploadMediaFromStream(stream, sectionPDF.mimeType);
      stream.close();
      
      // Create bulk operation record
      const bulkOperation = await BulkOperationModel.create({
        name: `Bulk Database PDF - ${sectionPDF.filename} - ${new Date().toISOString()}`,
        type: 'DOCUMENT',
        mediaUrl: mediaId,
        caption: `Document from ${department}`,
        department: department.toUpperCase(),
        totalRecipients: csvData.mobileNumbers.length,
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        status: 'PENDING',
        sentBy: userId as any,
        startedAt: new Date()
      });

      // Start processing messages immediately
      bulkOperation.status = 'PROCESSING';
      await bulkOperation.save();

      const results = [];
      let successCount = 0;
      let failedCount = 0;

      // Process messages in batches
      const BATCH_SIZE = 10;
      const CONCURRENCY_LIMIT = 5;
      
      for (let i = 0; i < csvData.mobileNumbers.length; i += BATCH_SIZE) {
        const batch = csvData.mobileNumbers.slice(i, i + BATCH_SIZE);
        
        // Process batch with concurrency control
        const batchPromises = [];
        for (let j = 0; j < batch.length; j += CONCURRENCY_LIMIT) {
          const concurrencyBatch = batch.slice(j, j + CONCURRENCY_LIMIT);
          batchPromises.push(
            Promise.allSettled(
              concurrencyBatch.map(async (mobileNumber) => {
                try {
                  // Create message log
                  const log = await MessageLogModel.create({
                    to: mobileNumber,
                    type: 'DOCUMENT',
                    payload: { 
                      mediaId, 
                      filename: sectionPDF.filename,
                      caption: `Document from ${department}`,
                      originalPDFId: pdfId
                    },
                    status: 'QUEUED',
                    department: department.toUpperCase(),
                    sentBy: userId as any
                  });

                  // Send document using mediaId
                  const data = await sendDocumentByMediaId({ 
                    to: mobileNumber, 
                    mediaId
                  });
                  
                  // Update log
                  log.status = 'SENT';
                  log.waMessageId = data?.messages?.[0]?.id;
                  await log.save();
                  
                  return { success: true, mobileNumber, waMessageId: data?.messages?.[0]?.id };
                } catch (error: any) {
                  console.error(`Failed to send to ${mobileNumber}:`, error);
                  return { success: false, mobileNumber, error: error.message };
                }
              })
            )
          );
        }
        
        const batchResults = await Promise.all(batchPromises);
        
        // Process results
        for (const batchResult of batchResults) {
          // batchResult is a PromiseSettledResult array
          for (const result of batchResult) {
            if (result.status === 'fulfilled') {
              if (result.value.success) {
                successCount++;
              } else {
                failedCount++;
              }
              results.push(result.value);
            } else {
              failedCount++;
              results.push({ success: false, mobileNumber: 'unknown', error: result.reason });
            }
          }
        }
        
        // Update bulk operation progress
        bulkOperation.processedCount = Math.min(i + BATCH_SIZE, csvData.mobileNumbers.length);
        bulkOperation.successCount = successCount;
        bulkOperation.failedCount = failedCount;
        await bulkOperation.save();
        
        // Small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < csvData.mobileNumbers.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Update final status
      bulkOperation.status = 'COMPLETED';
      bulkOperation.completedAt = new Date();
      await bulkOperation.save();

      // Update PDF status based on success/failure
      if (failedCount === 0) {
        // All messages sent successfully - mark PDF as SENT
        sectionPDF.status = 'SENT';
        sectionPDF.sentAt = new Date();
        sectionPDF.sentBy = userId;
        sectionPDF.sentByName = req.user?.email || 'Unknown';
        await sectionPDF.save();
        console.log(`✅ PDF marked as SENT - all messages delivered successfully`);
      } else {
        // Some messages failed - keep PDF as UPLOADED for retry
        console.log(`❌ PDF status NOT updated due to ${failedCount} failed sends - keeping as UPLOADED for retry`);
      }

      // Clean up temporary file
      fs.unlink(tmpPath, () => {});

      res.json({
        message: 'Bulk messaging completed',
        stats: {
          totalNumbers: csvData.mobileNumbers.length,
          successCount,
          failedCount,
          operationId: bulkOperation._id
        },
        results: results.slice(0, 10) // Return first 10 results for debugging
      });

    } catch (uploadError: any) {
      // Clean up temporary file
      fs.unlink(tmpPath, () => {});
      
      // Update PDF status to failed
      sectionPDF.status = 'FAILED';
      sectionPDF.error = uploadError?.response?.data ? JSON.stringify(uploadError.response.data) : String(uploadError);
      await sectionPDF.save();
      
      throw uploadError;
    }

  } catch (error: any) {
    console.error('Bulk database PDF error:', error);
    res.status(500).json({ error: 'Failed to process bulk database PDF messaging', details: String(error) });
  }
}));

// Test route to debug form data parsing
router.post('/test-form-data', requireRole('CLERK', 'ADMIN'), uploadWithFormData.any(), async (req: any, res) => {
  console.log('=== TEST ROUTE DEBUG ===');
  console.log('Request body:', req.body);
  console.log('Request body keys:', Object.keys(req.body));
  console.log('Request body values:', Object.values(req.body));
  console.log('Files:', req.files);
  console.log('Headers:', req.headers);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('========================');
  
  res.json({
    body: req.body,
    files: req.files,
    headers: req.headers
  });
});

// Simple single document route - accepts one number and document file
const singleDocumentSchema = z.object({
  to: z.string().min(8),
  caption: z.string().optional(),
  department: z.string().min(1).optional(),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional()
});

// New single message route for the updated frontend
const singleMessageSchema = z.object({
  mobileNumber: z.string().min(8),
  department: z.string().min(1).optional()
});

router.post('/single-document', requireRole('CLERK', 'ADMIN'), upload.any(), async (req: any, res) => {
  try {
    const files = (req.files || []) as Array<any>;
    const documentFile = files.find(f => f.fieldname === 'documentFile') || files[0];
    
    if (!documentFile) {
      return res.status(400).json({ error: 'Document file is required' });
    }

    console.log('Single document - Received form data:', req.body);
    console.log('Single document - Received files:', files.map(f => ({ fieldname: f.fieldname, originalname: f.originalname, mimetype: f.mimetype, size: f.size })));

    // Clean up the request body by trimming field names and values
    const cleanedBody: any = {};
    Object.keys(req.body).forEach(key => {
      const trimmedKey = key.trim();
      const value = req.body[key];
      cleanedBody[trimmedKey] = typeof value === 'string' ? value.trim() : value;
    });
    
    console.log('Cleaned body:', cleanedBody);

    const parsed = singleDocumentSchema.safeParse(cleanedBody);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    // Validate department after form data is parsed
    if (parsed.data.department) {
      try {
        const dept = await DepartmentModel.findOne({ 
          $or: [
            { code: parsed.data.department.toUpperCase() },
            { name: parsed.data.department }
          ],
          isActive: true 
        });
        
        if (!dept) {
          return res.status(400).json({ 
            error: 'Invalid department', 
            message: `Department '${parsed.data.department}' is not valid or inactive` 
          });
        }
        
        // Add validated department info for later use
        req.body.validatedDepartment = dept;
      } catch (error) {
        return res.status(500).json({ error: 'Failed to validate department' });
      }
    }

    // Upload document to WhatsApp to get mediaId
    const tmpPath = path.join(process.cwd(), 'uploads', `${Date.now()}-${documentFile.originalname || 'document.pdf'}`);
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, documentFile.buffer);
    const stream = fs.createReadStream(tmpPath);
    const mediaId = await uploadMediaFromStream(stream, documentFile.mimetype || 'application/pdf');
    stream.close();
    fs.unlink(tmpPath, () => {});

    // Create message log
    const log = await MessageLogModel.create({
      to: parsed.data.to,
      type: 'DOCUMENT',
      payload: { mediaId, filename: documentFile.originalname, caption: parsed.data.caption },
      status: 'QUEUED',
      department: req.body.validatedDepartment?.code || parsed.data.department,
      sentBy: req.user?.userId as any
    });

    try {
      // Send document using mediaId
      const data = await sendDocumentByMediaId({ 
        to: parsed.data.to, 
        mediaId
      });
      log.status = 'SENT';
      log.waMessageId = data?.messages?.[0]?.id;
      await log.save();

          // Clean up PDF file from department folder after successful sending
          const deptCode = req.body.validatedDepartment?.code || parsed.data.department;
          if (deptCode && documentFile.originalname) {
            await deletePDFFromDepartment(deptCode, documentFile.originalname);
            console.log(`🧹 Cleaned up PDF file for single message`);
          }

      res.json({
        ok: true,
        id: log.id,
        waMessageId: log.waMessageId,
        mediaId
      });
    } catch (e: any) {
      console.error('Single document send error:', e);
      log.status = 'FAILED';
      log.error = e?.response?.data ? JSON.stringify(e.response.data) : String(e);
      await log.save();
      
      // DO NOT delete PDF file if sending failed
      console.log(`❌ PDF file NOT deleted due to send failure: ${documentFile.originalname}`);
      
      res.status(502).json({ error: 'Failed to send document', details: log.error });
    }

  } catch (error: any) {
    res.status(500).json({ error: 'Failed to process single document', details: String(error) });
  }
});

// Send PDF from database (for section users)
router.post('/send-database-pdf', requireRole('CLERK', 'ADMIN'), async (req: any, res) => {
  try {
    const { pdfId, to, department, scheduledDate, scheduledTime } = req.body;
    
    if (!pdfId || !to || !department) {
      return res.status(400).json({ error: 'PDF ID, recipient, and department are required' });
    }

    // Find the PDF in database
    const pdf = await SectionPDFModel.findOne({ 
      _id: pdfId,
      department: department.toUpperCase(),
      status: 'UPLOADED'
    });
    
    if (!pdf) {
      return res.status(404).json({ error: 'PDF not found or already sent' });
    }

    // Convert base64 data back to buffer
    const pdfBuffer = Buffer.from(pdf.pdfData, 'base64');
    
    // Create temporary file for WhatsApp upload
    const tmpPath = path.join(process.cwd(), 'uploads', `${Date.now()}-${pdf.filename}`);
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, pdfBuffer);
    
    try {
      // Upload to WhatsApp
      const stream = fs.createReadStream(tmpPath);
      const mediaId = await uploadMediaFromStream(stream, pdf.mimeType);
      stream.close();
      
      // Create message log
      const log = await MessageLogModel.create({
        to: to,
        type: 'DOCUMENT',
        payload: { mediaId, filename: pdf.filename, caption: `Document from ${department}` },
        status: 'QUEUED',
        department: department,
        sentBy: req.user?.userId as any
      });

      // Send document using mediaId
      const data = await sendDocumentByMediaId({ 
        to: to, 
        mediaId
      });
      
      // Update log
      log.status = 'SENT';
      log.waMessageId = data?.messages?.[0]?.id;
      await log.save();

      // Update PDF status and delete from database
      pdf.status = 'SENT';
      pdf.sentAt = new Date();
      pdf.sentBy = req.user?.userId;
      pdf.sentByName = req.user?.email || 'Unknown';
      pdf.waMessageId = log.waMessageId;
      await pdf.save();
      
      // Delete PDF from database after successful send
      await deletePDFFromDatabase(pdfId);
      
      // Clean up temporary file
      fs.unlink(tmpPath, () => {});

      res.json({
        ok: true,
        id: log.id,
        waMessageId: log.waMessageId,
        mediaId,
        message: 'PDF sent successfully and removed from database'
      });
      
    } catch (e: any) {
      // Update PDF status to failed
      pdf.status = 'FAILED';
      pdf.error = e?.response?.data ? JSON.stringify(e.response.data) : String(e);
      await pdf.save();
      
      // Clean up temporary file
      fs.unlink(tmpPath, () => {});
      
      res.status(502).json({ error: 'Failed to send PDF', details: e.message });
    }

  } catch (error: any) {
    res.status(500).json({ error: 'Failed to process database PDF', details: String(error) });
  }
});

// Section clerk upload PDF route - saves to SectionPDF collection
router.post('/section-upload', requireRole('SECTION'), upload.single('pdfFile'), async (req: any, res) => {
  try {
    const { mobileNumber } = req.body;
    const pdfFile = req.file;
    const userDepartment = req.user?.department;
    const userId = req.user?.userId; // Changed from req.user?.id to req.user?.userId
    
    console.log('=== SECTION UPLOAD DEBUG ===');
    console.log('req.user:', req.user);
    console.log('userId:', userId);
    console.log('userDepartment:', userDepartment);
    
    if (!pdfFile) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    if (!mobileNumber) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    if (!userDepartment) {
      return res.status(400).json({ error: 'User department not found' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'User ID not found' });
    }

    // Validate user's department exists
    console.log('Validating department:', userDepartment);
    const dept = await DepartmentModel.findOne({ 
      $or: [
        { code: { $regex: new RegExp(`^${userDepartment}$`, 'i') } },
        { name: { $regex: new RegExp(`^${userDepartment}$`, 'i') } }
      ]
    });
    console.log('Found department:', dept);
    if (!dept) {
      // Get all available departments for better error message
      const allDepts = await DepartmentModel.find({}).select('code name');
      console.log('Available departments:', allDepts.map(d => `${d.name} (${d.code})`));
      return res.status(400).json({ 
        error: 'Invalid user department',
        details: `Department '${userDepartment}' not found. Available departments: ${allDepts.map(d => d.code).join(', ')}`
      });
    }

    // Get user details for name
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Rename file to mobile number format
    const fileExtension = path.extname(pdfFile.originalname);
    const newFileName = `${mobileNumber}${fileExtension}`;
    
    // Convert PDF to base64 for MongoDB storage
    const pdfBase64 = pdfFile.buffer.toString('base64');

    // Create section PDF document
    console.log('💾 Creating PDF document with department:', userDepartment);
    const sectionPDF = new SectionPDFModel({
      filename: newFileName,
      originalName: pdfFile.originalname,
      mobileNumber: mobileNumber,
      department: userDepartment,
      uploadedBy: userId,
      uploadedByName: user.email,
      pdfData: pdfBase64,
      fileSize: pdfFile.size,
      mimeType: pdfFile.mimetype,
      status: 'UPLOADED'
    });
    
    console.log('💾 PDF document created:', {
      filename: sectionPDF.filename,
      department: sectionPDF.department,
      status: sectionPDF.status
    });

    await sectionPDF.save();
    console.log('✅ PDF saved to database successfully');
    console.log('PDF ID:', sectionPDF._id);
    console.log('Department:', sectionPDF.department);
    console.log('Status:', sectionPDF.status);

    res.json({
      success: true,
      message: 'PDF uploaded successfully to your section',
      fileName: newFileName,
      department: userDepartment,
      pdfId: sectionPDF._id,
      uploadedBy: user.email
    });

  } catch (error: any) {
    console.error('Section upload error:', error);
    res.status(500).json({ error: 'Failed to upload PDF', details: String(error) });
  }
});

// Clerk send PDF route - can select from any section and send to WhatsApp
router.post('/clerk-send', requireRole('CLERK', 'ADMIN'), upload.single('pdfFile'), async (req: any, res) => {
  try {
    const { mobileNumber, department, pdfId } = req.body;
    const pdfFile = req.file;
    const userId = req.user?.userId;
    
    if (!mobileNumber) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    if (!department) {
      return res.status(400).json({ error: 'Department is required' });
    }

    // Validate department
    const dept = await DepartmentModel.findOne({ 
      $or: [
        { code: department.toUpperCase() },
        { name: department }
      ]
    });
    if (!dept) {
      return res.status(400).json({ error: 'Invalid department' });
    }

    let fileToSend;
    let fileName;
    let sectionPDF;

    if (pdfFile) {
      // New file upload
      const fileExtension = path.extname(pdfFile.originalname);
      fileName = `${mobileNumber}${fileExtension}`;
      fileToSend = pdfFile.buffer;
    } else if (pdfId) {
      // Using existing PDF from SectionPDF collection
      sectionPDF = await SectionPDFModel.findById(pdfId);
      if (!sectionPDF) {
        return res.status(404).json({ error: 'PDF not found in database' });
      }

      if (sectionPDF.department !== department) {
        return res.status(400).json({ error: 'PDF does not belong to selected department' });
      }

      if (sectionPDF.status !== 'UPLOADED') {
        return res.status(400).json({ error: 'PDF has already been processed' });
      }

      // Get PDF data from MongoDB
      fileToSend = Buffer.from(sectionPDF.pdfData, 'base64');
      fileName = sectionPDF.filename;
    } else {
      return res.status(400).json({ error: 'PDF file or PDF ID is required' });
    }

    // Get user details for sent by name
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Upload to WhatsApp and send
    const tmpPath = path.join(process.cwd(), 'uploads', `${Date.now()}-${fileName}`);
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, fileToSend);

    const mediaId = await uploadMediaFromStream(fs.createReadStream(tmpPath), 'application/pdf');
    fs.unlinkSync(tmpPath);

    try {
      const data = await sendDocumentByMediaId({ 
        to: mobileNumber, 
        mediaId 
      });

      // Update section PDF status to SENT only on success
      if (sectionPDF) {
        await SectionPDFModel.findByIdAndUpdate(pdfId, {
          status: 'SENT',
          sentAt: new Date(),
          sentBy: userId,
          sentByName: user.email,
          waMessageId: data?.messages?.[0]?.id
        });
      }

      // Create message log for sent message
      const log = new MessageLogModel({
        to: mobileNumber,
        type: 'DOCUMENT',
        payload: {
          filename: fileName,
          mediaId: mediaId,
          sentBy: 'CLERK',
          originalPDFId: pdfId
        },
        status: 'SENT',
        department: department,
        sentBy: userId,
        waMessageId: data?.messages?.[0]?.id
      });

      await log.save();

      res.json({
        success: true,
        message: 'PDF sent successfully via WhatsApp',
        fileName: fileName,
        waMessageId: data?.messages?.[0]?.id,
        logId: log._id
      });
    } catch (sendError: any) {
      console.error('WhatsApp send error:', sendError);
      
      // Create message log for failed message
      const log = new MessageLogModel({
        to: mobileNumber,
        type: 'DOCUMENT',
        payload: {
          filename: fileName,
          mediaId: mediaId,
          sentBy: 'CLERK',
          originalPDFId: pdfId
        },
        status: 'FAILED',
        department: department,
        sentBy: userId,
        error: sendError.message
      });

      await log.save();

      // DO NOT update section PDF status if send failed
      console.log(`❌ PDF status NOT updated due to send failure: ${fileName}`);

      res.status(500).json({ 
        error: 'Failed to send PDF', 
        details: sendError.message 
      });
    }

  } catch (error: any) {
    console.error('Clerk send error:', error);
    res.status(500).json({ error: 'Failed to send PDF', details: String(error) });
  }
});

// Get bulk operation status
router.get('/bulk-operation/:operationId', requireRole('ADMIN'), async (req, res) => {
  try {
    const operation = await getBulkOperationStatus(req.params.operationId);
    if (!operation) {
      return res.status(404).json({ error: 'Bulk operation not found' });
    }
    res.json(operation);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get bulk operation status', details: String(error) });
  }
});

// Get all messages with their statuses
router.get('/messages', requireRole('ADMIN'), async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const type = req.query.type as string;
    const department = req.query.department as string;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;
    const search = req.query.search as string;
    // Simple date-only sorting (default desc). No other sort params required.
    const sortDate = (req.query.sortDate as string) === 'asc' ? 1 : -1; // default desc

    // Build filter object
    const filter: any = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (department) filter.department = department;
    if (dateFrom || dateTo) {
      filter.createdAt = {} as any;
      if (dateFrom) (filter.createdAt as any).$gte = new Date(dateFrom);
      if (dateTo) (filter.createdAt as any).$lte = new Date(dateTo);
    }
    
    // Add search functionality
    if (search) {
      filter.$or = [
        { to: { $regex: search, $options: 'i' } },
        { 'payload.filename': { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    // Build aggregation pipeline with date-only sorting
    const pipeline: any[] = [
      { $match: filter },
    ];

    pipeline.push({ $sort: { createdAt: sortDate } });

    pipeline.push({ $skip: skip }, { $limit: limit });

    // Execute aggregation
    const messages = await MessageLogModel.aggregate(pipeline);

    // Populate sentBy after aggregation
    const populated = await MessageLogModel.populate(messages, { path: 'sentBy', select: 'email role fullName username' });

    // Get totals and stats
    const [total, statusStats, typeStats] = await Promise.all([
      MessageLogModel.countDocuments(filter),
      MessageLogModel.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      MessageLogModel.aggregate([
        { $match: filter },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      messages: populated,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      sorting: {
        sortDate: sortDate === 1 ? 'asc' : 'desc',
      },
      statistics: {
        status: statusStats,
        type: typeStats
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get messages', details: String(error) });
  }
});

// Get message by ID
router.get('/messages/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const message = await MessageLogModel.findById(req.params.id)
      .populate('sentBy', 'email role');
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    res.json(message);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get message', details: String(error) });
  }
});

// Export messages as CSV
router.get('/messages/export/csv', requireRole('ADMIN'), async (req, res) => {
  try {
    const status = req.query.status as string;
    const type = req.query.type as string;
    const department = req.query.department as string;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;
    const search = req.query.search as string;
    
    // Build filter object (same as messages endpoint)
    const filter: any = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (department) filter.department = department;
    if (dateFrom || dateTo) {
      filter.createdAt = {} as any;
      if (dateFrom) (filter.createdAt as any).$gte = new Date(dateFrom);
      if (dateTo) (filter.createdAt as any).$lte = new Date(dateTo);
    }
    
    // Add search functionality
    if (search) {
      filter.$or = [
        { to: { $regex: search, $options: 'i' } },
        { 'payload.filename': { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } }
      ];
    }

    // Get all messages matching the filter (no pagination for export)
    const messages = await MessageLogModel.find(filter)
      .populate('sentBy', 'email fullName')
      .sort({ createdAt: -1 })
      .lean();

    // Convert to CSV format
    const csvHeaders = [
      'Department',
      'Clerk Name',
      'File Name',
      'Phone Number',
      'Upload Time',
      'Send Time',
      'Status',
      'Message Type',
      'WhatsApp Message ID'
    ];

    const csvRows = messages.map(msg => [
      msg.department || '',
      (msg.sentBy as any)?.fullName || (msg.sentBy as any)?.email || '',
      msg.payload?.filename || '',
      msg.to || '',
      (msg as any).createdAt ? new Date((msg as any).createdAt).toLocaleString() : '',
      (msg as any).updatedAt ? new Date((msg as any).updatedAt).toLocaleString() : '',
      msg.status || '',
      msg.type || '',
      msg.waMessageId || ''
    ]);

    // Create CSV content
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="messaging-logs-${new Date().toISOString().split('T')[0]}.csv"`);
    
    res.send(csvContent);
  } catch (error: any) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Failed to export CSV', details: String(error) });
  }
});

// Get message statistics
router.get('/messages-stats', requireRole('ADMIN'), async (req, res) => {
  try {
    const department = req.query.department as string;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;
    const search = req.query.search as string;
    
    // Build date filter
    const dateFilter: any = {};
    if (dateFrom || dateTo) {
      dateFilter.createdAt = {};
      if (dateFrom) dateFilter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) dateFilter.createdAt.$lte = new Date(dateTo);
    }
    
    // Build department filter
    const deptFilter = department ? { department } : {};
    
    // Build search filter
    const searchFilter: any = {};
    if (search) {
      searchFilter.$or = [
        { to: { $regex: search, $options: 'i' } },
        { 'payload.filename': { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } }
      ];
    }
    
    const filter = { ...dateFilter, ...deptFilter, ...searchFilter };
    
    // Get comprehensive statistics
    const stats = await MessageLogModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: { $sum: { $cond: [{ $eq: ['$status', 'SENT'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ['$status', 'READ'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
          queued: { $sum: { $cond: [{ $eq: ['$status', 'QUEUED'] }, 1, 0] } },
          text: { $sum: { $cond: [{ $eq: ['$type', 'TEXT'] }, 1, 0] } },
          image: { $sum: { $cond: [{ $eq: ['$type', 'IMAGE'] }, 1, 0] } },
          document: { $sum: { $cond: [{ $eq: ['$type', 'DOCUMENT'] }, 1, 0] } },
          template: { $sum: { $cond: [{ $eq: ['$type', 'TEMPLATE'] }, 1, 0] } }
        }
      }
    ]);
    
    const result = stats[0] || {
      total: 0, sent: 0, delivered: 0, read: 0, failed: 0, queued: 0,
      text: 0, image: 0, document: 0, template: 0
    };
    
    // Calculate delivery rate
    const deliveryRate = result.total > 0 ? 
      ((result.delivered + result.read) / result.total * 100).toFixed(2) : 0;
    
    // Calculate read rate
    const readRate = result.delivered > 0 ? 
      (result.read / result.delivered * 100).toFixed(2) : 0;
    
    res.json({
      ...result,
      deliveryRate: `${deliveryRate}%`,
      readRate: `${readRate}%`
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get message statistics', details: String(error) });
  }
});

export default router;


