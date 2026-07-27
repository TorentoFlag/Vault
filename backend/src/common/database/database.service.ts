import { Inject, Injectable, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

import type { DatabaseConnectionOptions } from "./database.config";
import { DATABASE_CONNECTION_OPTIONS } from "./database.tokens";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool | null;

  constructor(@Inject(DATABASE_CONNECTION_OPTIONS) options: DatabaseConnectionOptions) {
    this.pool = options.enabled ? new Pool({ connectionString: options.databaseUrl }) : null;
  }

  isConfigured(): boolean {
    return this.pool !== null;
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    if (this.pool === null) {
      throw new ServiceUnavailableException("Database is not configured");
    }
    return this.pool.query<Row>(text, [...values]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
