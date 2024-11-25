import {Construct} from 'constructs';
import {Stage, StageProps} from "aws-cdk-lib";
import {AppComputeStack} from "./app-compute.stack";

export class AppComputeStage extends Stage {
    constructor(scope: Construct, id: string, props: StageProps) {
        super(scope, id, props);

        new AppComputeStack(this, 'AppComputeStack', {
            stackName: 'AppComputeStack',
            env: props.env,
            ...props
        });
    }
}
