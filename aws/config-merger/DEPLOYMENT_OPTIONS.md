# Deployment Options

## Current Setup (AWS SAM with Clean Names)

The updated `template.yaml` now creates clean, predictable resource names:

### Resources Created:
- **Lambda Function**: `jbrowse-config-merger` (exact name, no hash)
- **API Gateway**: `jbrowse-config-merger-api` (exact name, no hash)
- **Log Group**: `/aws/lambda/jbrowse-config-merger` (exact name)
- **CloudFormation Stack**: `jbrowse-config-merger` (you choose during deploy)

### What SAM Still Creates with Hashes:
- **IAM Role**: `jbrowse-config-merger-ConfigMergerFunctionRole-ABC123`
  - This is unavoidable in SAM but doesn't matter (you never reference it)

### API URL Format:
```
https://{random-id}.execute-api.{region}.amazonaws.com/prod/merge
```

The API Gateway ID is still random, but this is actually **good** because:
1. It's globally unique (no conflicts)
2. You only set it once in your code
3. It's stable after creation (doesn't change)

## Alternative: Plain CloudFormation (More Control)

If you want even more control, here's a pure CloudFormation template:

```yaml
# template-cfn.yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: JBrowse Config Merger - Pure CloudFormation

Resources:
  ConfigMergerRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: jbrowse-config-merger-role
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

  ConfigMergerFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: jbrowse-config-merger
      Runtime: nodejs20.x
      Handler: index.handler
      Role: !GetAtt ConfigMergerRole.Arn
      Code:
        ZipFile: |
          // Placeholder - deploy with zip file
      MemorySize: 512
      Timeout: 30

  ConfigMergerLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: /aws/lambda/jbrowse-config-merger
      RetentionInDays: 7

  ConfigMergerApi:
    Type: AWS::ApiGatewayV2::Api
    Properties:
      Name: jbrowse-config-merger-api
      ProtocolType: HTTP
      CorsConfiguration:
        AllowOrigins:
          - '*'
        AllowMethods:
          - GET
          - OPTIONS
        AllowHeaders:
          - Content-Type

  ConfigMergerIntegration:
    Type: AWS::ApiGatewayV2::Integration
    Properties:
      ApiId: !Ref ConfigMergerApi
      IntegrationType: AWS_PROXY
      IntegrationUri: !Sub arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ConfigMergerFunction.Arn}/invocations
      PayloadFormatVersion: '2.0'

  ConfigMergerRoute:
    Type: AWS::ApiGatewayV2::Route
    Properties:
      ApiId: !Ref ConfigMergerApi
      RouteKey: GET /merge
      Target: !Sub integrations/${ConfigMergerIntegration}

  ConfigMergerStage:
    Type: AWS::ApiGatewayV2::Stage
    Properties:
      ApiId: !Ref ConfigMergerApi
      StageName: prod
      AutoDeploy: true

  LambdaApiPermission:
    Type: AWS::Lambda::Permission
    Properties:
      FunctionName: !Ref ConfigMergerFunction
      Action: lambda:InvokeFunction
      Principal: apigateway.amazonaws.com
      SourceArn: !Sub arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${ConfigMergerApi}/*/*

Outputs:
  ApiUrl:
    Value: !Sub https://${ConfigMergerApi}.execute-api.${AWS::Region}.amazonaws.com/prod/merge
```

**Pros:**
- Full control over every resource
- Clean IAM role name
- Uses HTTP API (cheaper than REST API)

**Cons:**
- Manual zip file deployment
- More complex
- Have to manage updates yourself

## Alternative: Terraform (Most Control)

```hcl
# main.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  default = "us-east-1"
}

# Lambda Function
resource "aws_lambda_function" "config_merger" {
  filename         = "dist.zip"
  function_name    = "jbrowse-config-merger"
  role            = aws_iam_role.config_merger.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  memory_size     = 512
  timeout         = 30
  source_code_hash = filebase64sha256("dist.zip")

  environment {
    variables = {
      NODE_ENV = "production"
    }
  }
}

# IAM Role
resource "aws_iam_role" "config_merger" {
  name = "jbrowse-config-merger-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.config_merger.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# API Gateway
resource "aws_apigatewayv2_api" "config_merger" {
  name          = "jbrowse-config-merger-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "OPTIONS"]
    allow_headers = ["Content-Type"]
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id           = aws_apigatewayv2_api.config_merger.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.config_merger.invoke_arn
}

resource "aws_apigatewayv2_route" "get_merge" {
  api_id    = aws_apigatewayv2_api.config_merger.id
  route_key = "GET /merge"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.config_merger.id
  name        = "prod"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.config_merger.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.config_merger.execution_arn}/*/*"
}

# CloudWatch Logs
resource "aws_cloudwatch_log_group" "config_merger" {
  name              = "/aws/lambda/jbrowse-config-merger"
  retention_in_days = 7
}

output "api_url" {
  value = "${aws_apigatewayv2_stage.prod.invoke_url}/merge"
}
```

**Pros:**
- Cleanest names possible
- State management
- Can use Terraform Cloud
- Better for infrastructure as code

**Cons:**
- Need to learn Terraform
- More setup

## Recommendation

**Stick with the updated SAM template** because:

1. ✅ Main resources have clean names
2. ✅ Simple deployment (`./deploy.sh`)
3. ✅ The API URL is the only thing with a hash, and you only set it once
4. ✅ Built-in packaging and deployment
5. ✅ AWS-native tool

The IAM role hash is unavoidable but doesn't matter since you never reference it directly.

## What You'll See in AWS Console

**Lambda Functions:**
```
jbrowse-config-merger
```

**API Gateway:**
```
jbrowse-config-merger-api
```

**CloudWatch Logs:**
```
/aws/lambda/jbrowse-config-merger
```

**IAM Roles:**
```
jbrowse-config-merger-ConfigMergerFunctionRole-ABC123
```
(Only this one has a hash, but you never look at it)

Clean and simple!
