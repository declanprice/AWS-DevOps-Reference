import {Construct} from 'constructs';
import {Stage, StageProps} from "aws-cdk-lib";
import {SimpleShopUiComputeStack} from "./simple-shop-ui-compute.stack";

export class SimpleShopUiComputeStage extends Stage {
    constructor(scope: Construct, id: string, props: StageProps) {
        super(scope, id, props);

        new SimpleShopUiComputeStack(this, 'SimpleShopUiComputeStack', {
            stackName: 'SimpleShopUiComputeStack',
            env: props.env,
            ...props
        });
    }
}
