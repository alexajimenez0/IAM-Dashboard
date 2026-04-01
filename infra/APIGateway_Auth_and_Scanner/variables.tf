variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name for tagging"
  type        = string
  default     = "IAMDash"
}

variable "api_name" {
  description = "Name of the combined HTTP API"
  type        = string
  default     = "iam-dashboard-combined-api-test"
}

variable "stage_name" {
  description = "Stage name for the HTTP API"
  type        = string
  default     = "v1"
}

variable "auth_lambda_function_name" {
  description = "Function name of the auth Lambda (looked up via data source)"
  type        = string
  default     = "test-BFF"
}

variable "scanner_lambda_function_name" {
  description = "Function name of the scanner Lambda (looked up via data source)"
  type        = string
  default     = "iam-dashboard-scanner"
}

variable "cors_allowed_origins" {
  description = "Explicit list of allowed browser origins. Must not be [\"*\"] — credentials require explicit origins."
  type        = list(string)
  default     = ["http://localhost:3001", "https://d33ytnxd7i6mo9.cloudfront.net", "http://localhost:5173", "http://localhost:5001"]
}

variable "cors_allowed_methods" {
  description = "Allowed HTTP methods for CORS"
  type        = list(string)
  default     = ["GET", "POST", "OPTIONS"]
}

variable "cors_allowed_headers" {
  description = "Allowed request headers for CORS"
  type        = list(string)
  default     = ["Content-Type", "Authorization", "X-Requested-With"]
}

variable "throttling_burst_limit" {
  description = "API Gateway throttling burst limit"
  type        = number
  default     = 100
}

variable "throttling_rate_limit" {
  description = "API Gateway throttling rate limit"
  type        = number
  default     = 50
}
