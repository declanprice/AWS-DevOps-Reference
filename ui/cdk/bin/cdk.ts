#!/usr/bin/env node
import 'source-map-support/register';
import {App} from "aws-cdk-lib";
import {SimpleShopUiPipelineStack} from "../lib/pipeline/simple-shop-ui-pipeline.stack";

const app = new App();

new SimpleShopUiPipelineStack(app, 'SimpleShopUiPipelineStack', {
    stackName: 'SimpleShopUiPipelineStack',
    env: {
        region: process.env.AWS_REGION,
        account: process.env.AWS_ACCOUNT
    }
})