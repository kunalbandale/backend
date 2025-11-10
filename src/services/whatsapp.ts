import axios from 'axios';
import { env } from '../config/env';
import fs from "fs";
import FormData from "form-data";
import type { ReadStream } from 'fs';




const base = `${env.wa.baseUrl}/${env.wa.version}`;

interface SendTextArgs {
  to: string; // E.164
  body: string;
}

interface SendImageArgs {
  to: string;
  imageUrl?: string;
  mediaId?: string;
  caption?: string;
}

interface SendDocumentArgs {
  to: string;
  documentUrl: string;
  caption?: string;
}

interface SendDocumentByIdArgs {
  to: string;
  mediaId: string;
  caption?: string;
}

interface SendTemplateArgs {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: Array<{
    type: string;
    parameters: Array<{
      type: string;
      text: string;
    }>;
  }>;
}
export async function sendText({ to, body }: SendTextArgs) {
  try {
    const res = await axios.post(
      `${base}/${env.wa.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body, preview_url: false },
      },
      { headers: { Authorization: `Bearer ${env.wa.accessToken}` } }
    );
    
    // Check if the response indicates success
    if (res.data && res.data.messages && res.data.messages.length > 0) {
      const message = res.data.messages[0];
      if (message.id) {
        console.log("✅ Text sent successfully! Message ID:", message.id);
        return res.data;
      } else {
        throw new Error("WhatsApp API returned no message ID - number may not be registered on WhatsApp");
      }
    } else {
      throw new Error("WhatsApp API returned invalid response - number may not be registered on WhatsApp");
    }
  } catch (error: any) {
    console.error("❌ Text send error:", error.response?.data || error.message);
    
    // Check for specific WhatsApp API errors
    if (error.response?.data?.error) {
      const waError = error.response.data.error;
      if (waError.code === 131026) {
        throw new Error("Phone number is not registered on WhatsApp");
      } else if (waError.code === 131021) {
        throw new Error("Invalid phone number format");
      } else if (waError.code === 131047) {
        throw new Error("Phone number is not a WhatsApp number");
      } else if (waError.code === 100) {
        throw new Error("Invalid parameter - phone number may not be valid or registered on WhatsApp");
      } else {
        throw new Error(`WhatsApp API Error: ${waError.message || 'Unknown error'}`);
      }
    }
    
    throw error;
  }
}

// Function to upload an image and get media ID
// Usage example:
// const mediaId = await uploadImage('./logo.png');
// await sendImage({ to: 'recipient_phone_number', mediaId, caption: 'Hello from Manfra.io!' });
export async function uploadImage(filePath: string, mimeType: string = 'image/png'): Promise<string> {
  const formData = new FormData();
  formData.append('messaging_product', 'whatsapp');
  formData.append('file', fs.createReadStream(filePath));
  formData.append('type', mimeType);

  const response = await axios.post(
    `https://graph.facebook.com/v22.0/804559172742131/media`,
    formData,
    {
      headers: {
        Authorization: `Bearer ${env.wa.accessToken}`,
        ...formData.getHeaders(),
      }
    }
  );

  return response.data.id; // This is the media ID you can use to send the image
}


export async function uploadMediaFromStream(stream: ReadStream, mimeType: string = "application/pdf"): Promise<string> {
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("file", stream);
  formData.append("type", mimeType);

  console.log("Uploading media to WhatsApp...");

  const response = await axios.post(
    `https://graph.facebook.com/v22.0/${env.wa.phoneNumberId}/media`,
    formData,
    {
      headers: {
        Authorization: `Bearer ${env.wa.accessToken}`,
        ...formData.getHeaders(),
      },
    }
  );

  console.log("✅ Uploaded Media ID:", response.data.id);
  return response.data.id;
}

// // Upload an arbitrary buffer/stream to WhatsApp media; returns media ID
// export async function uploadMediaFromStream(stream: ReadStream, mimeType: string = 'application/pdf'): Promise<string> {
//   // const formData = new FormData();
//   console.log(env.wa.phoneNumberId);
//   console.log(env.wa.accessToken);
//   console.log("hiioioi")
//   // formData.append('messaging_product', 'whatsapp');
//   // formData.append('file', stream);
//   // formData.append('type', mimeType);

//   // const response = await axios.post(
//   //   `${base}/${env.wa.phoneNumberId}/media`,
//   //   formData,
//   //   {
//   //     headers: {
//   //       Authorization: `Bearer ${env.wa.accessToken}`,
//   //       ...formData.getHeaders(),
//   //     }
//   //   }
//   // );

  
//   // return response.data.id;

//   const formData = new FormData();
//   formData.append("messaging_product", "whatsapp");
//   formData.append("file", stream);
//   formData.append("type", mimeType);

//   const response = await axios.post(
//     `https://graph.facebook.com/v22.0/804559172742131/media`,
//     formData,
//     {
//       headers: {
//         Authorization: `Bearer ${env.wa.accessToken}`,
//         ...formData.getHeaders(),
//       },
//     }
//   );

//   return response.data.id;
// }

// Function to send an image message
export async function sendImage({ to, imageUrl, mediaId, caption = '' }: SendImageArgs) {
  let imageData: any;

  if (mediaId) {
    // Use media ID if provided
    imageData = {
      id: mediaId,
      caption: caption
    };
  } else if (imageUrl) {
    // Use image URL if provided
    imageData = {
      link: imageUrl,
      caption: caption
    };
  } else {
    throw new Error('Either mediaId or imageUrl must be provided');
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/804559172742131/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'image',
        image: imageData,
      },
      {
        headers: {
          Authorization: `Bearer ${env.wa.accessToken}`,
          'Content-Type': 'application/json',
        }
      }
    );

    // Check if the response indicates success
    if (response.data && response.data.messages && response.data.messages.length > 0) {
      const message = response.data.messages[0];
      if (message.id) {
        console.log("✅ Image sent successfully! Message ID:", message.id);
        return response.data;
      } else {
        throw new Error("WhatsApp API returned no message ID - number may not be registered on WhatsApp");
      }
    } else {
      throw new Error("WhatsApp API returned invalid response - number may not be registered on WhatsApp");
    }
  } catch (error: any) {
    console.error("❌ Image send error:", error.response?.data || error.message);
    
    // Check for specific WhatsApp API errors
    if (error.response?.data?.error) {
      const waError = error.response.data.error;
      if (waError.code === 131026) {
        throw new Error("Phone number is not registered on WhatsApp");
      } else if (waError.code === 131021) {
        throw new Error("Invalid phone number format");
      } else if (waError.code === 131047) {
        throw new Error("Phone number is not a WhatsApp number");
      } else if (waError.code === 100) {
        throw new Error("Invalid parameter - phone number may not be valid or registered on WhatsApp");
      } else {
        throw new Error(`WhatsApp API Error: ${waError.message || 'Unknown error'}`);
      }
    }
    
    throw error;
  }
}

export async function sendDocument({ to, documentUrl, caption }: SendDocumentArgs) {
  try {
    const res = await axios.post(
      `${base}/${env.wa.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'document',
        document: { link: documentUrl, caption },
      },
      { headers: { Authorization: `Bearer ${env.wa.accessToken}` } }
    );
    
    // Check if the response indicates success
    if (res.data && res.data.messages && res.data.messages.length > 0) {
      const message = res.data.messages[0];
      if (message.id) {
        console.log("✅ Document sent successfully! Message ID:", message.id);
        return res.data;
      } else {
        throw new Error("WhatsApp API returned no message ID - number may not be registered on WhatsApp");
      }
    } else {
      throw new Error("WhatsApp API returned invalid response - number may not be registered on WhatsApp");
    }
  } catch (error: any) {
    console.error("❌ Document send error:", error.response?.data || error.message);
    
    // Check for specific WhatsApp API errors
    if (error.response?.data?.error) {
      const waError = error.response.data.error;
      if (waError.code === 131026) {
        throw new Error("Phone number is not registered on WhatsApp");
      } else if (waError.code === 131021) {
        throw new Error("Invalid phone number format");
      } else if (waError.code === 131047) {
        throw new Error("Phone number is not a WhatsApp number");
      } else if (waError.code === 100) {
        throw new Error("Invalid parameter - phone number may not be valid or registered on WhatsApp");
      } else {
        throw new Error(`WhatsApp API Error: ${waError.message || 'Unknown error'}`);
      }
    }
    
    throw error;
  }
}

// export async function sendDocumentByMediaId({ to, mediaId, caption }: SendDocumentByIdArgs) {
//   const res = await axios.post(
//     `${base}/${env.wa.phoneNumberId}/messages`,
//     {
//       messaging_product: 'whatsapp',
//       to,
//       type: 'document',
//       document: { id: mediaId, caption },
//     },
//     { headers: { Authorization: `Bearer ${env.wa.accessToken}` } }
//   );
//   return res.data;
// }
export async function sendDocumentByMediaId({ to, mediaId }: { to: string; mediaId: string }) {
  console.log("Sending template with document to:", to);

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: "district_collector_office_nanded", // ✅ your approved template
      language: { code: "en_US" },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "document",
              document: {
                id: mediaId,
                filename: "Notice.pdf" // optional custom filename
              }
            }
          ]
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: "08/10/2025" }, // first placeholder
            { type: "text", text: "Wednesday" }   // second placeholder
          ]
        }
      ]
    }
  };

  console.log("Document payload:", JSON.stringify(payload, null, 2));

  try {
    const res = await axios.post(
      `${base}/${env.wa.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${env.wa.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Check if the response indicates success
    if (res.data && res.data.messages && res.data.messages.length > 0) {
      const message = res.data.messages[0];
      if (message.id) {
        console.log("✅ Document sent successfully! Message ID:", message.id);
        return res.data;
      } else {
        throw new Error("WhatsApp API returned no message ID - number may not be registered on WhatsApp");
      }
    } else {
      throw new Error("WhatsApp API returned invalid response - number may not be registered on WhatsApp");
    }
  } catch (error: any) {
    console.error("❌ Document send error:", error.response?.data || error.message);
    
    // Check for specific WhatsApp API errors
    if (error.response?.data?.error) {
      const waError = error.response.data.error;
      if (waError.code === 131026) {
        throw new Error("Phone number is not registered on WhatsApp");
      } else if (waError.code === 131021) {
        throw new Error("Invalid phone number format");
      } else if (waError.code === 131047) {
        throw new Error("Phone number is not a WhatsApp number");
      } else if (waError.code === 100) {
        throw new Error("Invalid parameter - phone number may not be valid or registered on WhatsApp");
      } else {
        throw new Error(`WhatsApp API Error: ${waError.message || 'Unknown error'}`);
      }
    }
    
    throw error;
  }
}

export async function sendTemplate({ to, templateName, languageCode = 'en_US', components }: SendTemplateArgs) {
  const template: any = {
    name: templateName,
    language: { code: languageCode }
  };
  
  if (components) {
    template.components = components;
  }
  
  const res = await axios.post(
    `${base}/${env.wa.phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template,
    },
    { headers: { Authorization: `Bearer ${env.wa.accessToken}` } }
  );
  return res.data;
}


export async function sendBulkText(recipients: string[], body: string) {
  const results = [];
  
  for (const to of recipients) {
    try {
      const data = await sendText({ to, body });
      results.push({ to, status: 'success', data });
    } catch (error: any) {
      results.push({ to, status: 'failed', error: error.response?.data || error.message });
    }
  }
  
  return results;
}

export async function createTemplate(templateName: string, content: string, category: string = 'UTILITY') {
  try {
    const res = await axios.post(
      `https://graph.facebook.com/v22.0/${env.wa.phoneNumberId}/message_templates`,
      {
        name: templateName,
        category: category,
        language: 'en_US',
        components: [
          {
            type: 'BODY',
            text: content
          }
        ]
      },
      { headers: { Authorization: `Bearer ${env.wa.accessToken}` } }
    );
    return res.data;
  } catch (error: any) {
    throw new Error(`Failed to create template: ${error.response?.data?.error?.message || error.message}`);
  }
}


