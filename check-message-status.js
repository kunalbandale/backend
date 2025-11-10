// Example: Check message status in real-time
const mongoose = require('mongoose');
const { MessageLogModel } = require('./src/models/MessageLog');

async function checkMessageStatus(messageId) {
  try {
    // Connect to your database
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Find the message
    const message = await MessageLogModel.findById(messageId);
    
    if (!message) {
      console.log('Message not found');
      return;
    }
    
    console.log('📱 Message Status:', {
      id: message._id,
      to: message.to,
      type: message.type,
      status: message.status,
      waMessageId: message.waMessageId,
      sentAt: message.createdAt,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
      error: message.error
    });
    
    // Get status history
    const statusHistory = {
      queued: message.createdAt,
      sent: message.status === 'SENT' ? message.updatedAt : null,
      delivered: message.deliveredAt,
      read: message.readAt,
      failed: message.status === 'FAILED' ? message.updatedAt : null
    };
    
    console.log('📈 Status Timeline:', statusHistory);
    
  } catch (error) {
    console.error('Error checking message status:', error);
  }
}

// Usage: node check-message-status.js <messageId>
if (process.argv[2]) {
  checkMessageStatus(process.argv[2]);
}

module.exports = { checkMessageStatus };






