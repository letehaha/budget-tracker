// Mainly split to a separate file to avoid prettier moving "dotenv.config" below all the imports
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, `../../../.env.${process.env.NODE_ENV}`) });
