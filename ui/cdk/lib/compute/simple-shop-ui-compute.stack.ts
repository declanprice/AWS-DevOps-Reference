import {Construct} from 'constructs';
import {Stack, StackProps} from "aws-cdk-lib";
import {Cluster, Compatibility, FargateService, TaskDefinition} from "aws-cdk-lib/aws-ecs";
import {IVpc, Peer, Port, SecurityGroup, Vpc} from "aws-cdk-lib/aws-ec2";
import {
    ApplicationListener,
    ApplicationLoadBalancer,
    ApplicationProtocol,
    ApplicationTargetGroup
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {AnyPrincipal, Effect, PolicyDocument, PolicyStatement, Role} from "aws-cdk-lib/aws-iam";
import {EcsApplication, EcsDeploymentConfig, EcsDeploymentGroup} from "aws-cdk-lib/aws-codedeploy";

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

        const cluster = new Cluster(this, 'SimpleShopUiFargateCluster', {
            vpc: defaultVpc,
            clusterName: 'SimpleShopUiFargateCluster',
        });

        const service = new FargateService(this, 'SimpleShopUiService', {
            cluster,
            serviceName: 'SimpleShopUiService',
            taskDefinition: new TaskDefinition(
                this, 'SimpleShopUiTaskDefinition', {
                    compatibility: Compatibility.FARGATE,
                    cpu: '.25'
                }
            )
        })

        new ComputeDeploymentResources(this, 'ComputeDeploymentResources', {
            defaultVpc,
            service
        })
    }
}


class ComputeDeploymentResources extends Construct {
    constructor(scope: Construct, id: string, props: {
        defaultVpc: IVpc,
        service: FargateService
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

        const listener = new ApplicationListener(this, 'SimpleShopUiListener', {
            loadBalancer: alb,
            port: 3000,
            protocol: ApplicationProtocol.HTTP,
            open: true,
            defaultTargetGroups: [
                greenTg,
                blueTg
            ]
        })

        const application = new EcsApplication(this, 'SimpleShopUiEcsApplication', {
            applicationName: 'SimpleShopUiEcsApplication',
        });

        new EcsDeploymentGroup(this, 'SimpleShopUiEcsDeploymentGroup', {
            service: props.service,
            application,
            deploymentGroupName: 'SimpleShopUiEcsDeploymentGroup',
            deploymentConfig: EcsDeploymentConfig.ALL_AT_ONCE,
            blueGreenDeploymentConfig: {
                greenTargetGroup: greenTg,
                blueTargetGroup: blueTg,
                listener,
            }
        })
    }
}