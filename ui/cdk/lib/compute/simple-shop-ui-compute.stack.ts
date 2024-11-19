import {Construct} from 'constructs';
import {Stack, StackProps} from "aws-cdk-lib";
import {Cluster} from "aws-cdk-lib/aws-ecs";
import {Vpc} from "aws-cdk-lib/aws-ec2";

export class SimpleShopUiComputeStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const defaultVpc = Vpc.fromLookup(this, 'DefaultVpc', {
            isDefault: true
        });

        new Cluster(this, 'SimpleShopUiFargateCluster', {
            vpc: defaultVpc,
            clusterName: 'SimpleShopUiFargateCluster',
        });

        // const service = new FargateService(this, 'SimpleShopUiFargateService', {
        //     serviceName: 'SimpleShopUiFargateService',
        //     cluster,
        // })
    }
}
