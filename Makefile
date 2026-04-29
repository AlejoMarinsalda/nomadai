AWS_ACCOUNT_ID := 237216011543
AWS_REGION     := us-east-1
ECR_REGISTRY   := $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com
IMAGE_NAME     := nomadai
LAMBDA_FUNC    := nomadai

.PHONY: deploy build push update-lambda ecr-login

## Deploy completo: build + push + actualizar Lambda
deploy: ecr-login build push update-lambda

## Build Docker con índice RAG bakeado (requiere GOOGLE_API_KEY en el ambiente)
build:
	@test -n "$$GOOGLE_API_KEY" || (echo "Error: GOOGLE_API_KEY no está definida" && exit 1)
	docker build \
		--secret id=google_api_key,env=GOOGLE_API_KEY \
		--platform linux/amd64 \
		--provenance=false \
		-t $(IMAGE_NAME):latest \
		-t $(ECR_REGISTRY)/$(IMAGE_NAME):latest \
		.

ecr-login:
	aws ecr get-login-password --region $(AWS_REGION) \
		| docker login --username AWS --password-stdin $(ECR_REGISTRY)

push:
	docker push $(ECR_REGISTRY)/$(IMAGE_NAME):latest

update-lambda:
	aws lambda update-function-code \
		--function-name $(LAMBDA_FUNC) \
		--image-uri $(ECR_REGISTRY)/$(IMAGE_NAME):latest
	aws lambda wait function-updated --function-name $(LAMBDA_FUNC)
	@echo "✅ Lambda actualizado"
