export interface ApiResponse<T = unknown> {
  data?: T;
  error?: ApiError;
  meta?: {
    correlationId: string;
    timestamp: string;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: string;
  correlationId?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    database: HealthCheck;
    keyVault: HealthCheck;
    signalR: HealthCheck;
  };
}

export interface HealthCheck {
  status: 'up' | 'down' | 'unknown';
  latencyMs?: number;
  error?: string;
}
