// Mainly split to a separate file to avoid prettier moving "dotenv.config" below all the imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, `../../../.env.${process.env.NODE_ENV}`);
dotenv.config({ path: envPath });
