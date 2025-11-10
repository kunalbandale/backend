## WhatsApp Notification Backend (No Reply Expected)

### Setup
- Copy `.env.example` to `.env` and fill values:
  - `MONGODB_URI`
  - `JWT_SECRET`
  - `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`
- Install deps: `npm install`
- Dev: `npm run dev`

### Roles
- ADMIN: manage users, contacts, templates.
- CLERK: send messages only.

### Auth
1) Register (bootstrap admin)
POST `/auth/register`
```json
{"email":"admin@example.com","password":"secret123","role":"ADMIN"}
```
2) Login
POST `/auth/login`
```json
{"email":"admin@example.com","password":"secret123"}
```
Use returned `token` as `Authorization: Bearer <token>`.

### Admin Endpoints
- POST `/admin/users` { email, password, role }
- GET `/admin/users`
- DELETE `/admin/users/:id`
- POST `/admin/contacts` { name, phone, tags? }
- GET `/admin/contacts`
- PUT `/admin/contacts/:id`
- DELETE `/admin/contacts/:id`
- POST `/admin/templates` { name, type: TEXT|IMAGE|DOCUMENT, body?, mediaUrl?, caption? }
- GET `/admin/templates`
- PUT `/admin/templates/:id`
- DELETE `/admin/templates/:id`
- POST `/admin/departments` { name, code, description?, isActive? }
- GET `/admin/departments` ?active=true|false
- GET `/admin/departments/:id`
- PUT `/admin/departments/:id`
- DELETE `/admin/departments/:id`
- PATCH `/admin/departments/:id/toggle`
- GET `/admin/bulk-operations` ?page=1&pageSize=20&department=CS&status=COMPLETED&userId=USER_ID
- GET `/admin/bulk-operations/:id`
- GET `/admin/bulk-operations/user/:userId`
- GET `/admin/bulk-operations/department/:department`
- GET `/admin/bulk-operations/stats/summary` ?startDate=2024-01-01&endDate=2024-01-31&department=CS

### Send (Clerk)
- POST `/send/text` { to, body, department? }
- POST `/send/media` { to, imageUrl|mediaId, caption?, department? }
- POST `/send/document` { to, documentUrl, caption?, department? }
- POST `/send/template` { to, templateName, languageCode?, components?, department? }
- POST `/send/bulk` { recipients[], body, department? }
- POST `/send/csv-bulk-text` { csvFile, operationName, messageContent, department }
- POST `/send/csv-bulk-image` { csvFile, operationName, imageUrl, caption?, department }
- POST `/send/csv-bulk-document` { csvFile, operationName, documentUrl, caption?, department }
- GET `/send/bulk-operation/:operationId` - Get bulk operation status

### Webhooks
- POST `/webhook/whatsapp` - WhatsApp status updates
- GET `/webhook/whatsapp` - Webhook verification

### Department Management
- Departments are validated against the database before sending messages
- Use department codes (e.g., "D1", "D2") or names in API requests
- Only active departments are accepted
- Seed initial departments: `npm run seed:departments`

### Message Status Tracking
- QUEUED: Message is queued for sending
- SENT: Message sent to WhatsApp API
- DELIVERED: Message delivered to recipient
- READ: Message read by recipient  
- FAILED: Message failed to send

### CSV Bulk Messaging
- Upload CSV files with mobile numbers for bulk messaging
- Supports text, image, and document messages
- Automatic mobile number validation and formatting
- Real-time status tracking for each message
- Background processing with progress monitoring
- Sample CSV format: `examples/sample-contacts.csv`

### Notes
- To comply with WhatsApp rules, use approved templates and explicit opt-in.
- Media endpoints require public URLs for WhatsApp to fetch.
- Department validation ensures only authorized departments can send messages.
- Message logs track department, sender, and detailed status information.
- CSV files should contain mobile numbers in columns named: mobile, phone, number, contact, etc.
- Bulk operations run in background and can be monitored via status endpoints.


