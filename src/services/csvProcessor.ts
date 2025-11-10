import csv from 'csv-parser';
import { Readable } from 'stream';

export interface CSVRow {
  [key: string]: string;
}

export interface ParsedCSVData {
  mobileNumbers: string[];
  totalRows: number;
  validNumbers: number;
  invalidNumbers: number;
  errors: string[];
}

export function parseCSVBuffer(buffer: Buffer): Promise<ParsedCSVData> {
  return new Promise((resolve, reject) => {
    const results: CSVRow[] = [];
    const mobileNumbers: string[] = [];
    const errors: string[] = [];
    let totalRows = 0;
    let validNumbers = 0;
    let invalidNumbers = 0;

    const stream = Readable.from(buffer.toString());
    
    stream
      .pipe(csv())
      .on('data', (row: CSVRow) => {
        totalRows++;
        results.push(row);
        
        // Try to find mobile number in different possible column names
        const mobileNumber = findMobileNumber(row);
        
        if (mobileNumber) {
          if (isValidMobileNumber(mobileNumber)) {
            mobileNumbers.push(mobileNumber);
            validNumbers++;
          } else {
            invalidNumbers++;
            errors.push(`Invalid mobile number format: ${mobileNumber} at row ${totalRows}`);
          }
        } else {
          invalidNumbers++;
          errors.push(`No mobile number found at row ${totalRows}`);
        }
      })
      .on('end', () => {
        resolve({
          mobileNumbers,
          totalRows,
          validNumbers,
          invalidNumbers,
          errors
        });
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

function findMobileNumber(row: CSVRow): string | null {
  // Common column names for mobile numbers
  const possibleColumns = [
    'mobile', 'phone', 'number', 'contact', 'mobile_number', 'phone_number',
    'contact_number', 'whatsapp', 'whatsapp_number', 'cell', 'cellphone'
  ];
  
  // Check for exact column name matches (case insensitive)
  for (const col of possibleColumns) {
    const value = row[col] || row[col.toLowerCase()] || row[col.toUpperCase()];
    if (value && typeof value === 'string') {
      return value.trim();
    }
  }
  
  // Check all columns for mobile number patterns
  for (const [key, value] of Object.entries(row)) {
    if (value && typeof value === 'string') {
      const trimmed = value.trim();
      if (isValidMobileNumber(trimmed)) {
        return trimmed;
      }
    }
  }
  
  return null;
}

function isValidMobileNumber(number: string): boolean {
  // Remove all non-digit characters
  const cleanNumber = number.replace(/\D/g, '');
  
  // Check if it's a valid mobile number (8-15 digits)
  if (cleanNumber.length < 8 || cleanNumber.length > 15) {
    return false;
  }
  
  // Basic validation - can be enhanced based on your requirements
  return /^\d{8,15}$/.test(cleanNumber);
}

export function formatMobileNumber(number: string): string {
  // Remove all non-digit characters
  const cleanNumber = number.replace(/\D/g, '');
  
  // Add country code if not present (assuming +1 for US, adjust as needed)
  if (cleanNumber.length === 10) {
    return `1${cleanNumber}`;
  }
  
  return cleanNumber;
}
