#!/usr/bin/env node
import 'source-map-support/register';
import {App} from "aws-cdk-lib";
import {AppPipelineStack} from "../lib/pipeline/app-pipeline.stack";
import {AppComputeStack} from "../lib/compute/app-compute.stack";

const app = new App();

new AppPipelineStack(app, 'AppPipelineStack', {
    stackName: 'AppPipelineStack',
    env: {
        region: process.env.AWS_REGION,
        account: process.env.AWS_ACCOUNT
    }
});

new AppComputeStack(app, 'AppComputeStack', {
    stackName: 'AppComputeStack',
    env: {
        region: process.env.AWS_REGION,
        account: process.env.AWS_ACCOUNT
    }
})