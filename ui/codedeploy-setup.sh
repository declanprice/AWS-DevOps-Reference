#!/bin/sh

ApplicationName=$1
ImageName=$2
ExecutionRoleArn=$3
TaskDefinitionArn=$3

echo "ApplicationName:"  $ApplicationName
echo "ImageName:"  $ImageName
echo "ExecutionRoleArn:"  $ExecutionRoleArn

sed 's/<APPLICATION_NAME>/'$ApplicationName'/g;s/<IMAGE_NAME>/'$ImageName'/g;s/<EXECUTION_ROLE_ARN>/'$ExecutionRoleArn'/g' taskdef-template.json > taskdef.json
