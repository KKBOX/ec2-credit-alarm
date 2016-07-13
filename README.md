# ec2-credit-alarm

Automatically manage CloudWatch alarm for EC2 instance credit balance.

## Requirement
- npm
- aws-cli
- GNU Make

## Getting started

### Configure Project
1. Clone this project.
2. Copy config/default.json.sample to config/**PROFILE**-**REGION**.json.
3. Add actions and setup region in config.

### Create IAM Role for Lambda Function
Run `make role [PROFILE="PROFILE"]` in project root.

### Setup Lambda Function and Event Source
Run `make setup [PROFILE="PROFILE"] REGION="REGION"` in project root.

### Update Lambda Function
Run `make update [PROFILE="PROFILE"] REGION="REGION"` in project root.
