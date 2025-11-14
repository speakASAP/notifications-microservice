/**
 * API Response Utility
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export class ApiResponseUtil {
  static success<T>(data: T): ApiResponse<T> {
    return {
      success: true,
      data,
    };
  }

  static error(code: string, message: string, details?: any): ApiResponse {
    return {
      success: false,
      error: {
        code,
        message,
        details,
      },
    };
  }
}

