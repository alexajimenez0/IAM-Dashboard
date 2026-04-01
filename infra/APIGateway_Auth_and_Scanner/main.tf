terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_lambda_function" "auth" {
  function_name = var.auth_lambda_function_name
}

data "aws_lambda_function" "scanner" {
  function_name = var.scanner_lambda_function_name
}

resource "aws_apigatewayv2_api" "combined" {
  name          = var.api_name
  protocol_type = "HTTP"
  description   = "Combined HTTP API Gateway for auth and scanner routes under one host"

  cors_configuration {
    allow_origins     = var.cors_allowed_origins
    allow_methods     = var.cors_allowed_methods
    allow_headers     = var.cors_allowed_headers
    allow_credentials = true
    max_age           = 3600
  }

  tags = {
    Name      = var.api_name
    Project   = var.project_name
    Env       = var.environment
    ManagedBy = "terraform"
  }
}

resource "aws_apigatewayv2_stage" "combined" {
  api_id      = aws_apigatewayv2_api.combined.id
  name        = var.stage_name
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = var.throttling_burst_limit
    throttling_rate_limit  = var.throttling_rate_limit
  }

  tags = {
    Name      = "${var.api_name}-${var.stage_name}"
    Project   = var.project_name
    Env       = var.environment
    ManagedBy = "terraform"
  }
}

# ── Integrations ──────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_integration" "auth" {
  api_id                 = aws_apigatewayv2_api.combined.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = data.aws_lambda_function.auth.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "scanner" {
  api_id                 = aws_apigatewayv2_api.combined.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = data.aws_lambda_function.scanner.invoke_arn
  payload_format_version = "2.0"
}

# ── Lambda permissions ────────────────────────────────────────────────────────

resource "aws_lambda_permission" "auth" {
  statement_id  = "AllowCombinedAPIGatewayInvokeAuth"
  action        = "lambda:InvokeFunction"
  function_name = data.aws_lambda_function.auth.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.combined.execution_arn}/*/*"
}

resource "aws_lambda_permission" "scanner" {
  statement_id  = "AllowCombinedAPIGatewayInvokeScanner"
  action        = "lambda:InvokeFunction"
  function_name = data.aws_lambda_function.scanner.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.combined.execution_arn}/*/*"
}

# ── Auth routes ───────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_route" "auth_login" {
  api_id    = aws_apigatewayv2_api.combined.id
  route_key = "POST /auth/login"
  target    = "integrations/${aws_apigatewayv2_integration.auth.id}"
}

resource "aws_apigatewayv2_route" "auth_logout" {
  api_id    = aws_apigatewayv2_api.combined.id
  route_key = "POST /auth/logout"
  target    = "integrations/${aws_apigatewayv2_integration.auth.id}"
}

resource "aws_apigatewayv2_route" "auth_session" {
  api_id    = aws_apigatewayv2_api.combined.id
  route_key = "GET /auth/session"
  target    = "integrations/${aws_apigatewayv2_integration.auth.id}"
}

# ── Scanner routes ────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_route" "scan_security_hub" {
  api_id    = aws_apigatewayv2_api.combined.id
  route_key = "POST /scan/security-hub"
  target    = "integrations/${aws_apigatewayv2_integration.scanner.id}"
}

resource "aws_apigatewayv2_route" "scan_guardduty" {
  api_id    = aws_apigatewayv2_api.combined.id
  route_key = "POST /scan/guardduty"
  target    = "integrations/${aws_apigatewayv2_integration.scanner.id}"
}

resource "aws_apigatewayv2_route" "scan_config" {
  api_id    = aws_apigatewayv2_api.combined.id
  route_key = "POST /scan/config"
  target    = "integrations/${aws_apigatewayv2_integration.scanner.id}"
}

resource "aws_apigatewayv2_route" "scan_inspector" {
  api_id    = aws_apigatewayv2_api.combined.id
  route_key = "POST /scan/inspector"
  target    = "integrations/${aws_apigatewayv2_integration.scanner.id}"
}

resource "aws_apigatewayv2_route" "scan_macie" {
  api_id    = aws_apigatewayv2_api.combined.id
  route_key = "POST /scan/macie"
  target    = "integrations/${aws_apigatewayv2_integration.scanner.id}"
}

resource "aws_apigatewayv2_route" "scan_iam" {
  api_id    = aws_apigatewayv2_api.combined.id
  route_key = "POST /scan/iam"
  target    = "integrations/${aws_apigatewayv2_integration.scanner.id}"
}

resource "aws_apigatewayv2_route" "scan_ec2" {
  api_id    = aws_apigatewayv2_api.combined.id
  route_key = "POST /scan/ec2"
  target    = "integrations/${aws_apigatewayv2_integration.scanner.id}"
}

resource "aws_apigatewayv2_route" "scan_s3" {
  api_id    = aws_apigatewayv2_api.combined.id
  route_key = "POST /scan/s3"
  target    = "integrations/${aws_apigatewayv2_integration.scanner.id}"
}

resource "aws_apigatewayv2_route" "scan_full" {
  api_id    = aws_apigatewayv2_api.combined.id
  route_key = "POST /scan/full"
  target    = "integrations/${aws_apigatewayv2_integration.scanner.id}"
}
