import { Request, Response, NextFunction } from 'express';
import { verifyJwt, JwtPayload } from '../utils/jwt';
import { DepartmentModel } from '../models/Department';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const token = auth.slice('Bearer '.length);
    req.user = verifyJwt(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles: Array<'ADMIN' | 'CLERK' | 'SECTION'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

export function validateDepartment() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const department = req.body.department;
    
    // If no department provided, skip validation (optional field)
    if (!department) {
      return next();
    }
    
    try {
      const dept = await DepartmentModel.findOne({ 
        $or: [
          { code: department.toUpperCase() },
          { name: department }
        ],
        isActive: true 
      });
      
      if (!dept) {
        return res.status(400).json({ 
          error: 'Invalid department', 
          message: `Department '${department}' is not valid or inactive` 
        });
      }
      
      // Add validated department info to request for later use
      req.body.validatedDepartment = dept;
      next();
    } catch (error) {
      res.status(500).json({ error: 'Failed to validate department' });
    }
  };
}


