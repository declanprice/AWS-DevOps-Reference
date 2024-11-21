import {Construct} from 'constructs';
import {Stack, StackProps} from "aws-cdk-lib";
import {Cluster,} from "aws-cdk-lib/aws-ecs";
import {IVpc, Peer, Port, SecurityGroup, Vpc} from "aws-cdk-lib/aws-ec2";
import {
    ApplicationListener,
    ApplicationLoadBalancer,
    ApplicationProtocol,
    ApplicationTargetGroup
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {AnyPrincipal, Effect, PolicyDocument, PolicyStatement, Role} from "aws-cdk-lib/aws-iam";

export class SimpleShopUiComputeStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const defaultVpc = Vpc.fromLookup(this, 'DefaultVpc', {
            isDefault: true
        });

        new Role(this, 'SimpleShopUiExecutionRole', {
            roleName: 'SimpleShopUiExecutionRole',
            assumedBy: new AnyPrincipal(),
            inlinePolicies: {
                'access': new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            resources: ['*'],
                            actions: ['*']
                        })
                    ]
                })
            }
        });

        new Cluster(this, 'SimpleShopUiFargateCluster', {
            vpc: defaultVpc,
            clusterName: 'SimpleShopUiFargateCluster',
        });

        new ComputeDeploymentResources(this, 'ComputeDeploymentResources', {
            defaultVpc,
        })
    }
}


class ComputeDeploymentResources extends Construct {
    constructor(scope: Construct, id: string, props: {
        defaultVpc: IVpc,
    }) {
        super(scope, id);

        const defaultVpc = props.defaultVpc;

        const albSecurityGroup = new SecurityGroup(this, 'SimpleShopUiAlbSg', {
            vpc: defaultVpc,
            securityGroupName: 'SimpleShopUiAlbSg',
            allowAllOutbound: true
        })

        albSecurityGroup.addIngressRule(Peer.ipv4('211.27.183.118/32'), Port.allTraffic());

        const alb = new ApplicationLoadBalancer(this, 'SimpleShopUiAlb', {
            vpc: defaultVpc,
            loadBalancerName: 'SimpleShopUiAlb',
            securityGroup: albSecurityGroup,
            internetFacing: true
        });

        const greenTg = new ApplicationTargetGroup(this, 'SimpleShopUiAlbBlueTargetGroup', {
            vpc: defaultVpc,
            targetGroupName: 'SimpleShopUiAlbBlueTargetGroup',
            port: 3000,
            protocol: ApplicationProtocol.HTTP
        });

        const blueTg = new ApplicationTargetGroup(this, 'SimpleShopUiAlbGreenTargetGroup', {
            vpc: defaultVpc,
            targetGroupName: 'SimpleShopUiAlbGreenTargetGroup',
            port: 3000,
            protocol: ApplicationProtocol.HTTP
        })

        new ApplicationListener(this, 'SimpleShopUiListener', {
            loadBalancer: alb,
            port: 3000,
            protocol: ApplicationProtocol.HTTP,
            open: true,
            defaultTargetGroups: [
                greenTg,
                blueTg
            ]
        })
    }
}