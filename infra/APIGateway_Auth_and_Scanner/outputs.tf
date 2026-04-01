output "api_id" {
  description = "Combined HTTP API Gateway ID"
  value       = aws_apigatewayv2_api.combined.id
}

output "api_arn" {
  description = "Combined HTTP API Gateway ARN"
  value       = aws_apigatewayv2_api.combined.arn
}

output "api_endpoint" {
  description = "Base endpoint for the combined HTTP API"
  value       = aws_apigatewayv2_api.combined.api_endpoint
}

output "stage_invoke_url" {
  description = "Invoke URL including stage name"
  value       = "${aws_apigatewayv2_api.combined.api_endpoint}/${aws_apigatewayv2_stage.combined.name}"
}
