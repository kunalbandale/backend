import { Router } from 'express';
import { MessageLogModel } from '../models/MessageLog';

const router = Router();

// WhatsApp webhook endpoint for status updates
router.post('/whatsapp', async (req, res) => {
  try {
    const { entry } = req.body;
    
    if (!entry || !Array.isArray(entry)) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    for (const webhookEntry of entry) {
      const { changes } = webhookEntry;
      
      if (!changes || !Array.isArray(changes)) continue;
      
      for (const change of changes) {
        const { value } = change;
        
        if (!value || !value.statuses) continue;
        
        // Process status updates
        for (const status of value.statuses) {
          const { id: waMessageId, status: messageStatus, timestamp } = status;
          
          if (!waMessageId || !messageStatus) continue;
          
          // Find the message log by WhatsApp message ID
          const messageLog = await MessageLogModel.findOne({ waMessageId });
          
          if (!messageLog) {
            console.log(`Message log not found for WhatsApp message ID: ${waMessageId}`);
            continue;
          }
          
          // Map WhatsApp status to our internal status
          let newStatus: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
          
          switch (messageStatus) {
            case 'sent':
              newStatus = 'SENT';
              break;
            case 'delivered':
              newStatus = 'DELIVERED';
              break;
            case 'read':
              newStatus = 'READ';
              break;
            case 'failed':
              newStatus = 'FAILED';
              break;
            default:
              console.log(`Unknown WhatsApp status: ${messageStatus}`);
              continue;
          }
          
          // Update the message log status
          await messageLog.updateStatus(newStatus);
          
          console.log(`Updated message ${waMessageId} status to ${newStatus}`);
        }
      }
    }
    
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Webhook verification endpoint (for WhatsApp)
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  // You should set this verify token in your environment variables
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'your_verify_token';
  
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    console.log('Webhook verification failed');
    res.status(403).json({ error: 'Forbidden' });
  }
});

export default router;
