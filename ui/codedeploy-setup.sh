#!/bin/sh

ImageName=$1

echo "ImageName:"  $ImageName

sed 's/<IMAGE_NAME>/'$ImageName'/g' taskdef-template.json > taskdef.json
