#
ifdef PROFILE
PROFILE := ${PROFILE}
export AWS_DEFAULT_PROFILE=${PROFILE}
else
PROFILE := default
endif

region:
ifndef REGION
	$(error REGION is not set)
endif
	$(eval export AWS_DEFAULT_REGION=${REGION})
	$(eval CONFIG := ${PROFILE}-${REGION}.json)

default: region
	cp "config/${CONFIG}" config/default.json
	test -f config/default.json

role:
	aws iam create-role --role-name lambda-ec2-credit-alarm --assume-role-policy-document '{"Version":"2012-10-17","Statement":{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}}'
	aws iam attach-role-policy --role-name lambda-ec2-credit-alarm --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
	aws iam put-role-policy --role-name lambda-ec2-credit-alarm --policy-name EC2-DescribeInstance --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["ec2:DescribeInstance*"],"Resource":["*"]}]}'
	aws iam put-role-policy --role-name lambda-ec2-credit-alarm --policy-name CloudWatch-Alarm-Readwrite --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["cloudwatch:DeleteAlarms","cloudwatch:DescribeAlarms","cloudwatch:PutMetricAlarm"],"Resource":["*"]}]}'

build: index.js default
	npm install
	rm -f ec2-credit-alarm.zip
	zip -r ec2-credit-alarm.zip index.js config/default.json node_modules/

setup: build
	$(eval ACCOUNT_ID := $(shell aws iam get-role --role-name lambda-ec2-credit-alarm --query "Role.Arn" --profile ${PROFILE} | cut -d':' -f5))
	aws lambda create-function --function-name ec2-credit-alarm --runtime nodejs4.3 --role arn:aws:iam::${ACCOUNT_ID}:role/lambda-ec2-credit-alarm --handler index.handler --zip-file fileb://ec2-credit-alarm.zip --timeout=10
	aws events put-rule --schedule-expression 'rate(1 hour)' --name ec2-credit-alarm
	aws lambda add-permission --function-name ec2-credit-alarm --statement-id ec2-credit-alarm --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/ec2-credit-alarm
	aws events put-targets --rule ec2-credit-alarm --targets '{"Id":"1","Arn":"arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:ec2-credit-alarm"}'

update: build
	aws lambda update-function-code --function-name ec2-credit-alarm --zip-file fileb://ec2-credit-alarm.zip

clean:
	rm -fr ec2-credit-alarm.zip node_modules/ config/default.json
