// config/addon.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default data directory path
let dataDirectory = process.env.DATA_DIRECTORY || '/config/zalo_bot';

// Tu khoa "tra loi ca tin cua chinh chu": bot chay tren CHINH tai khoan
// nguoi dung thi tin chu tu go bi Zalo danh isSelf. Add-on chi day tin isSelf
// khi no CHUA tu khoa nay (self_reply=true) — cau bot tu sinh khong chua tu
// khoa nen khong day -> khong lap. Rong = tinh nang tat (giu hanh vi cu).
// Nguon: env SELF_REPLY_KEYWORD (docker compose) hoac options.json (HA).
let selfReplyKeyword = process.env.SELF_REPLY_KEYWORD || '';

// Function to load Home Assistant options if available
export function loadHomeAssistantOptions() {
  try {
    // Check if we're running in Home Assistant
    const optionsPath = '/data/options.json';
    if (fs.existsSync(optionsPath)) {
      const options = JSON.parse(fs.readFileSync(optionsPath, 'utf8'));
      if (options.data_directory) {
        dataDirectory = options.data_directory;
        console.log(`Loaded data directory from Home Assistant options: ${dataDirectory}`);
      }
      if (typeof options.self_reply_keyword === 'string') {
        selfReplyKeyword = options.self_reply_keyword.trim();
        if (selfReplyKeyword) console.log('Loaded self_reply_keyword from Home Assistant options');
      }
    }
  } catch (error) {
    console.error('Error loading Home Assistant options:', error);
  }
  
  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDirectory)) {
    try {
      fs.mkdirSync(dataDirectory, { recursive: true });
      console.log(`Created data directory: ${dataDirectory}`);
    } catch (error) {
      console.error(`Error creating data directory: ${error.message}`);
    }
  }
  
  return dataDirectory;
}

// Get the absolute data directory path
export function getDataDirectory() {
  return dataDirectory;
}

// Tu khoa "tra loi ca tin cua chinh chu" (rong = tat).
export function getSelfReplyKeyword() {
  return selfReplyKeyword;
}

// Get the path to a file within the data directory
export function getDataFilePath(filename) {
  return path.join(dataDirectory, filename);
}
