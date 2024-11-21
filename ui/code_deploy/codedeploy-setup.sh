#!/bin/sh

ImageName=$1

echo "ImageName:"  $ImageName

sed -e 's|<IMAGE_NAME>|'$ImageName'|g' ./codedeploy/taskdef-template.json > ./codedeploy/taskdef.json