# Clean Resource Names

## What You'll See in AWS

After deploying, your AWS resources will have clean, predictable names:

### Lambda
```
Function Name: jbrowse-config-merger
```

### API Gateway
```
API Name: jbrowse-config-merger-api
API ID: abc123xyz (random, but stable)
URL: https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/merge
```

### CloudWatch Logs
```
Log Group: /aws/lambda/jbrowse-config-merger
```

### CloudFormation
```
Stack Name: jbrowse-config-merger (you choose during deploy)
```

### IAM Role (Only one with hash)
```
Role Name: jbrowse-config-merger-ConfigMergerFunctionRole-ABC123
```

The IAM role has a hash to prevent conflicts, but you never reference it directly, so it doesn't matter.

## Compared to Default SAM

**Default SAM (ugly):**
```
Lambda: jbrowse-config-merger-stack-ConfigMergerFunction-Abc123XyZ
API: jbrowse-config-merger-stack-ServerlessRestApi-XYZ123
Stack: jbrowse-config-merger-stack
```

**Our Template (clean):**
```
Lambda: jbrowse-config-merger
API: jbrowse-config-merger-api
Stack: jbrowse-config-merger
```

Much better!

## What About the API Gateway ID?

The API Gateway ID (e.g., `abc123xyz`) is random, but this is actually good:

1. **Globally unique** - No conflicts across AWS
2. **Stable** - Never changes once created
3. **Set once** - You only configure it in your code once
4. **AWS standard** - This is how all API Gateway URLs work

You'll use it like:
```javascript
const LAMBDA_URL = 'https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/merge'
```

And never think about it again!

## How to Deploy with Clean Names

Just run the deploy script:

```bash
./deploy.sh
```

When prompted for stack name, use:
```
Stack Name: jbrowse-config-merger
```

That's it! All resources will use clean names.

## Customizing Names

Edit `template.yaml`:

```yaml
Resources:
  ConfigMergerFunction:
    Properties:
      FunctionName: your-custom-name  # Change this

  ConfigMergerApi:
    Properties:
      Name: your-custom-api-name      # Change this

  ConfigMergerFunctionLogGroup:
    Properties:
      LogGroupName: /aws/lambda/your-custom-name  # Change this
```

## Want Even More Control?

See `DEPLOYMENT_OPTIONS.md` for:
- Pure CloudFormation (manual deployment)
- Terraform (infrastructure as code)
- Custom domain names for API Gateway

But for most cases, the current setup is perfect!
