import { BulkOperationModel } from '../models/BulkOperation';
import { MessageLogModel } from '../models/MessageLog';
import { sendText, sendImage, sendDocument, sendDocumentByMediaId } from './whatsapp';
import { formatMobileNumber } from './csvProcessor';

export interface BulkMessageData {
  type: 'TEXT' | 'IMAGE' | 'DOCUMENT';
  messageContent?: string;
  mediaUrl?: string;
  imageUrl?: string;
  documentUrl?: string;
  mediaId?: string;
  caption?: string;
  department: string;
  mobileNumbers: string[];
  sentBy: string;
  operationName: string;
}

export async function processBulkMessage(data: BulkMessageData): Promise<string> {
  const {
    type,
    messageContent,
    mediaUrl,
    imageUrl,
    documentUrl,
    mediaId,
    caption,
    department,
    mobileNumbers,
    sentBy,
    operationName
  } = data;

  // Create bulk operation record
  const bulkOperation = await BulkOperationModel.create({
    name: operationName,
    type,
    messageContent,
    mediaUrl: mediaUrl || imageUrl || documentUrl || mediaId,
    caption,
    department,
    totalRecipients: mobileNumbers.length,
    processedCount: 0,
    successCount: 0,
    failedCount: 0,
    status: 'PENDING',
    sentBy: sentBy as any,
    startedAt: new Date()
  });

  // Start processing in background
  processBulkMessagesInBackground(String(bulkOperation._id), mobileNumbers, data);

  return String(bulkOperation._id);
}

// Configuration for parallel processing - optimized for different scenarios
const getOptimalConfig = (messageCount: number) => {
  if (messageCount <= 20) {
    return { CONCURRENCY_LIMIT: 2, BATCH_SIZE: 5, RATE_LIMIT_DELAY: 200 };
  } else if (messageCount <= 50) {
    return { CONCURRENCY_LIMIT: 3, BATCH_SIZE: 8, RATE_LIMIT_DELAY: 150 };
  } else if (messageCount <= 200) {
    return { CONCURRENCY_LIMIT: 5, BATCH_SIZE: 15, RATE_LIMIT_DELAY: 100 };
  } else if (messageCount <= 500) {
    return { CONCURRENCY_LIMIT: 8, BATCH_SIZE: 25, RATE_LIMIT_DELAY: 75 };
  } else if (messageCount <= 1000) {
    return { CONCURRENCY_LIMIT: 10, BATCH_SIZE: 40, RATE_LIMIT_DELAY: 50 };
  } else {
    return { CONCURRENCY_LIMIT: 12, BATCH_SIZE: 60, RATE_LIMIT_DELAY: 25 };
  }
};

// Default configuration
const CONCURRENCY_LIMIT = 5; // Process 5 messages concurrently
const RATE_LIMIT_DELAY = 50; // 50ms delay between batches (20 messages/second per batch)
const BATCH_SIZE = 10; // Process 10 messages per batch

async function processBulkMessagesInBackground(
  operationId: string,
  mobileNumbers: string[],
  messageData: BulkMessageData
) {
  const bulkOperation = await BulkOperationModel.findById(operationId);
  if (!bulkOperation) return;

  bulkOperation.status = 'PROCESSING';
  await bulkOperation.save();

  const { type, messageContent, mediaUrl, imageUrl, documentUrl, mediaId, caption, department, sentBy } = messageData;

  try {
    // Get optimal configuration based on message count
    const config = getOptimalConfig(mobileNumbers.length);
    console.log(`🚀 Starting parallel processing of ${mobileNumbers.length} messages with optimized config:`, config);
    
  // Process messages in batches for better memory management
  const batches = [];
  for (let i = 0; i < mobileNumbers.length; i += config.BATCH_SIZE) {
    batches.push(mobileNumbers.slice(i, i + config.BATCH_SIZE));
  }

  // Memory optimization: Clear unused variables
  // mobileNumbers = null; // Free up memory - commented out to avoid type issues

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} messages)`);

      // Process batch with controlled concurrency
      const batchResults = await processBatchWithConcurrency(
        batch,
        messageData,
        operationId,
        batchIndex * config.BATCH_SIZE,
        config
      );

      // Update counters
      processedCount += batchResults.processed;
      successCount += batchResults.success;
      failedCount += batchResults.failed;

      // Update bulk operation status (only save every few batches to reduce DB load)
      bulkOperation.processedCount = processedCount;
      bulkOperation.successCount = successCount;
      bulkOperation.failedCount = failedCount;
      
      // Only save to database every 3 batches or on last batch
      if (batchIndex % 3 === 0 || batchIndex === batches.length - 1) {
        await bulkOperation.save();
        console.log(`💾 Updated bulk operation: ${processedCount} processed, ${successCount} sent, ${failedCount} failed`);
      }

      console.log(`✅ Batch ${batchIndex + 1} completed: ${batchResults.success} sent, ${batchResults.failed} failed`);

      // Rate limiting delay between batches (except for last batch)
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, config.RATE_LIMIT_DELAY));
      }
    }

    // Mark operation as completed
    bulkOperation.status = 'COMPLETED';
    bulkOperation.completedAt = new Date();
    await bulkOperation.save();

    console.log(`🎉 Bulk operation completed: ${successCount} sent, ${failedCount} failed`);

  } catch (error: any) {
    // Mark operation as failed
    bulkOperation.status = 'FAILED';
    bulkOperation.error = String(error);
    bulkOperation.completedAt = new Date();
    await bulkOperation.save();

    console.error(`💥 Bulk operation failed: ${error}`);
  }
}

// Process a batch of messages with controlled concurrency
async function processBatchWithConcurrency(
  mobileNumbers: string[],
  messageData: BulkMessageData,
  operationId: string,
  startIndex: number,
  config: { CONCURRENCY_LIMIT: number; BATCH_SIZE: number; RATE_LIMIT_DELAY: number }
): Promise<{ processed: number; success: number; failed: number }> {
  const { type, messageContent, mediaUrl, imageUrl, documentUrl, mediaId, caption, department, sentBy } = messageData;
  
  // Create all message logs first (batch database operation)
  const messageLogs = [];
  for (let i = 0; i < mobileNumbers.length; i++) {
    const mobileNumber = formatMobileNumber(mobileNumbers[i]);
    messageLogs.push({
      to: mobileNumber,
      type,
      payload: type === 'TEXT' 
        ? { body: messageContent }
        : { 
            [type === 'IMAGE' ? 'imageUrl' : 'documentUrl']: mediaUrl || imageUrl || documentUrl || mediaId,
            caption 
          },
      status: 'QUEUED',
      department,
      sentBy: sentBy as any
    });
  }

  // Bulk insert message logs
  const createdLogs = await MessageLogModel.insertMany(messageLogs);

  // Process messages with controlled concurrency using Promise.allSettled
  const concurrencyChunks = [];
  for (let i = 0; i < mobileNumbers.length; i += config.CONCURRENCY_LIMIT) {
    concurrencyChunks.push(mobileNumbers.slice(i, i + config.CONCURRENCY_LIMIT));
  }

  let successCount = 0;
  let failedCount = 0;
  const bulkUpdates: any[] = []; // For batch database updates

  for (const chunk of concurrencyChunks) {
    // Create promises for concurrent processing
    const promises = chunk.map(async (mobileNumber, index) => {
      const messageLog = createdLogs[index];
      
      try {
        let result;
        
        // Send message based on type with retry logic
        let retries = 0;
        const maxRetries = 2;
        
        while (retries <= maxRetries) {
          try {
            switch (type) {
              case 'TEXT':
                result = await sendText({ to: mobileNumber, body: messageContent! });
                break;
              case 'IMAGE':
                result = await sendImage({ to: mobileNumber, imageUrl: imageUrl || mediaUrl!, caption });
                break;
              case 'DOCUMENT':
                if (mediaId) {
                  result = await sendDocumentByMediaId({ to: mobileNumber, mediaId });
                } else {
                  result = await sendDocument({ to: mobileNumber, documentUrl: documentUrl || mediaUrl!, caption });
                }
                break;
            }
            break; // Success, exit retry loop
          } catch (retryError: any) {
            retries++;
            if (retries > maxRetries) {
              throw retryError; // Re-throw if max retries exceeded
            }
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
          }
        }

        // Prepare bulk update for success
        bulkUpdates.push({
          updateOne: {
            filter: { _id: messageLog._id },
            update: {
              $set: {
                status: 'SENT',
                waMessageId: result?.messages?.[0]?.id,
                updatedAt: new Date()
              }
            }
          }
        });

        console.log(`✅ Sent ${type} message to ${mobileNumber}`);
        return { success: true, mobileNumber, waMessageId: result?.messages?.[0]?.id };

      } catch (error: any) {
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

        console.log(`❌ Failed to send ${type} message to ${mobileNumber}: ${error?.response?.data ? JSON.stringify(error.response.data) : String(error)}`);
        return { success: false, mobileNumber, error: error?.response?.data ? JSON.stringify(error.response.data) : String(error) };
      }
    });

    // Wait for all promises in this chunk to complete
    const results = await Promise.allSettled(promises);
    
    // Count results
    results.forEach((result) => {
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

    // Small delay between concurrency chunks to respect rate limits
    if (concurrencyChunks.indexOf(chunk) < concurrencyChunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }

  // Batch update all message logs at once (much faster than individual saves)
  if (bulkUpdates.length > 0) {
    try {
      await MessageLogModel.bulkWrite(bulkUpdates);
      console.log(`📊 Batch updated ${bulkUpdates.length} message logs`);
    } catch (error) {
      console.error('❌ Error in batch update:', error);
      // Fallback to individual updates if bulk update fails
      for (const update of bulkUpdates) {
        try {
          await MessageLogModel.findByIdAndUpdate(update.updateOne.filter._id, update.updateOne.update);
        } catch (individualError) {
          console.error('❌ Individual update failed:', individualError);
        }
      }
    }
  }

  return {
    processed: mobileNumbers.length,
    success: successCount,
    failed: failedCount
  };
}

export async function getBulkOperationStatus(operationId: string) {
  return await BulkOperationModel.findById(operationId).populate('sentBy', 'email role');
}

export async function getBulkOperationsByUser(userId: string, page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;
  
  const [operations, total] = await Promise.all([
    BulkOperationModel.find({ sentBy: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate('sentBy', 'email role'),
    BulkOperationModel.countDocuments({ sentBy: userId })
  ]);

  return { operations, total, page, pageSize };
}

export async function getBulkOperationsByDepartment(department: string, page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;
  
  const [operations, total] = await Promise.all([
    BulkOperationModel.find({ department })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .populate('sentBy', 'email role'),
    BulkOperationModel.countDocuments({ department })
  ]);

  return { operations, total, page, pageSize };
}
