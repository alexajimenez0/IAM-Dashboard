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

variable "role_name" {
  description = "Name of the cross-account scan role"
  type        = string
  default     = "iam-dashboard-scan-role"
}

variable "main_account_id" {
  description = "AWS account ID where the scanner Lambda execution role lives"
  type        = string
}
