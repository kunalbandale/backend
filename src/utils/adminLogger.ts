import { AdminLogModel } from '../models/AdminLog';

export interface LogActivityParams {
  action: string;
  type: 'ADD' | 'DELETE' | 'MODIFY' | 'SEND' | 'LOGIN' | 'LOGOUT';
  performedBy: string;
  performedById: string;
  details: string;
  targetType?: 'USER' | 'SECTION' | 'MESSAGE' | 'FILE' | 'SETTINGS';
  targetId?: string;
  metadata?: any;
}

export const logAdminActivity = async (params: LogActivityParams): Promise<void> => {
  try {
    await AdminLogModel.create({
      action: params.action,
      type: params.type,
      performedBy: params.performedBy,
      performedById: params.performedById,
      details: params.details,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata
    });
  } catch (error) {
    console.error('Failed to log admin activity:', error);
    // Don't throw error to avoid breaking the main operation
  }
};

export const logUserCreation = async (user: any, performedBy: string, performedById: string) => {
  const roleText = user.role === 'ADMIN' ? 'Admin' : user.role === 'CLERK' ? 'Clerk' : 'Section User';
  const departmentText = user.department ? ` for ${user.department} section` : '';
  
  await logAdminActivity({
    action: 'User Created',
    type: 'ADD',
    performedBy,
    performedById,
    details: `New ${roleText} user added${departmentText}`,
    targetType: 'USER',
    targetId: user._id,
    metadata: { role: user.role, department: user.department }
  });
};

export const logUserUpdate = async (user: any, performedBy: string, performedById: string, changes: any) => {
  const roleText = user.role === 'ADMIN' ? 'Admin' : user.role === 'CLERK' ? 'Clerk' : 'Section User';
  
  await logAdminActivity({
    action: 'User Modified',
    type: 'MODIFY',
    performedBy,
    performedById,
    details: `${roleText} user updated`,
    targetType: 'USER',
    targetId: user._id,
    metadata: { changes, role: user.role }
  });
};

export const logUserDeletion = async (user: any, performedBy: string, performedById: string) => {
  const roleText = user.role === 'ADMIN' ? 'Admin' : user.role === 'CLERK' ? 'Clerk' : 'Section User';
  
  await logAdminActivity({
    action: 'User Deleted',
    type: 'DELETE',
    performedBy,
    performedById,
    details: `${roleText} user deleted`,
    targetType: 'USER',
    targetId: user._id,
    metadata: { role: user.role, department: user.department }
  });
};

export const logSectionCreation = async (section: any, performedBy: string, performedById: string) => {
  await logAdminActivity({
    action: 'Section Created',
    type: 'ADD',
    performedBy,
    performedById,
    details: `New section added`,
    targetType: 'SECTION',
    targetId: section._id,
    metadata: { code: section.code, name: section.name }
  });
};

export const logSectionUpdate = async (section: any, performedBy: string, performedById: string, changes: any) => {
  await logAdminActivity({
    action: 'Section Modified',
    type: 'MODIFY',
    performedBy,
    performedById,
    details: `Section updated`,
    targetType: 'SECTION',
    targetId: section._id,
    metadata: { changes, code: section.code }
  });
};

export const logSectionDeletion = async (section: any, performedBy: string, performedById: string) => {
  await logAdminActivity({
    action: 'Section Deleted',
    type: 'DELETE',
    performedBy,
    performedById,
    details: `Section deleted`,
    targetType: 'SECTION',
    targetId: section._id,
    metadata: { code: section.code, name: section.name }
  });
};

export const logMessageSent = async (message: any, performedBy: string, performedById: string) => {
  await logAdminActivity({
    action: 'Message Sent',
    type: 'SEND',
    performedBy,
    performedById,
    details: `WhatsApp message sent`,
    targetType: 'MESSAGE',
    targetId: message._id,
    metadata: { to: message.to, department: message.department, type: message.type }
  });
};

export const logFileUpload = async (file: any, performedBy: string, performedById: string, department: string) => {
  await logAdminActivity({
    action: 'File Uploaded',
    type: 'ADD',
    performedBy,
    performedById,
    details: `File uploaded to system`,
    targetType: 'FILE',
    targetId: file._id,
    metadata: { filename: file.originalName || file.filename, department, size: file.size }
  });
};
