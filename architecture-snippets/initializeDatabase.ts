import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Abre (ou retorna) a conexão singleton com o banco de dados.
 * Na primeira chamada, cria as tabelas caso ainda não existam.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;

  const db = await SQLite.openDatabaseAsync('royalcare_v5.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS perfis (
      id TEXT PRIMARY KEY NOT NULL,
      nome TEXT NOT NULL,
      cor_avatar TEXT,
      diagnosticos TEXT, 
      data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS medicamentos (
      id TEXT PRIMARY KEY NOT NULL,
      perfil_id TEXT NOT NULL,
      nome TEXT NOT NULL,
      tipo_dosagem TEXT NOT NULL,
      quantidade_dose REAL NOT NULL,
      frequencia_horas INTEGER NOT NULL,
      data_inicio TEXT NOT NULL, 
      duracao_dias INTEGER, 
      observacoes TEXT, 
      tags_uso TEXT,
      estoque_atual REAL NOT NULL,
      estoque_minimo REAL NOT NULL,
      status_ativo INTEGER DEFAULT 1,
      FOREIGN KEY (perfil_id) REFERENCES perfis (id)
    );

    CREATE TABLE IF NOT EXISTS historico_doses (
      id TEXT PRIMARY KEY NOT NULL,
      medicamento_id TEXT NOT NULL,
      data_hora_tomada DATETIME NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY (medicamento_id) REFERENCES medicamentos (id)
    );

    CREATE TABLE IF NOT EXISTS anexos_paciente (
      id TEXT PRIMARY KEY NOT NULL,
      perfil_id TEXT NOT NULL,
      nome_arquivo TEXT NOT NULL,
      uri TEXT NOT NULL,
      data_upload DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (perfil_id) REFERENCES perfis (id)
    );
  `);

  dbInstance = db;
  return db;
}

// Alias para manter compatibilidade com o _layout.tsx
export const initializeDatabase = getDatabase;