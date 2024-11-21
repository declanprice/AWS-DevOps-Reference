#!/bin/sh

ImageName=$1

echo "ImageName:"  $ImageName

sed -e 's|<IMAGE_NAME>|'$ImageName'|g' ./code_deploy/taskdef-template.json > ./code_deploy/taskdef.json