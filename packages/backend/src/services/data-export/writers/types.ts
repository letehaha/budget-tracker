import type { BuiltFile, ExportTable } from '../types';

export interface ExportUserHeader {
  username: string;
  email: string | null;
  baseCurrency: string;
}

export interface ExportWriterInput {
  tables: ExportTable[];
  exportedAt: Date;
  /**
   * Only the JSON writer emits a user-header block, so the field is optional.
   * The orchestrator skips the lookup entirely when the chosen format does
   * not need it.
   */
  user?: ExportUserHeader;
}

export interface ExportWriter {
  /**
   * Uniform Promise return – even synchronous writers (CSV, JSON) wrap their
   * output. Callers always `await`. The map key in `writers/index.ts` is the
   * single source of format dispatch – writers do not carry their format on
   * the instance.
   */
  write(input: ExportWriterInput): Promise<BuiltFile[]>;
}
