import fs from 'fs-extra';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'database.json');

export interface User {
  id: number;
  username: string;
  password?: string;
  created_at: string;
}

interface DatabaseSchema {
  users: User[];
  lastId: number;
}

const defaultDb: DatabaseSchema = {
  users: [],
  lastId: 0
};

export const initDb = async () => {
  const exists = await fs.pathExists(dbPath);
  if (!exists) {
    await fs.writeJson(dbPath, defaultDb, { spaces: 2 });
  }
};

export const getDb = async (): Promise<DatabaseSchema> => {
  return await fs.readJson(dbPath);
};

export const saveDb = async (data: DatabaseSchema) => {
  await fs.writeJson(dbPath, data, { spaces: 2 });
};

export default { initDb, getDb, saveDb };
