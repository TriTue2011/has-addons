// config/addon.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default data directory path
let dataDirectory = process.env.DATA_DIRECTORY || '/config/zalo_bot';


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


// Get the path to a file within the data directory
export function getDataFilePath(filename) {
  return path.join(dataDirectory, filename);
}
