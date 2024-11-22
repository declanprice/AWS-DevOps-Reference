import {Construct} from 'constructs';
import {Duration, Stack, StackProps} from "aws-cdk-lib";
import {
    Cluster,
    Compatibility,
    ContainerImage,
    DeploymentControllerType,
    LogDriver,
    Protocol,
    TaskDefinition
} from "aws-cdk-lib/aws-ecs";
import {IVpc, Peer, Port, SecurityGroup, Vpc} from "aws-cdk-lib/aws-ec2";
import {
    ApplicationProtocol,
    ApplicationTargetGroup,
    ListenerAction,
    TargetType
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {AnyPrincipal, Effect, PolicyDocument, PolicyStatement, Role} from "aws-cdk-lib/aws-iam";
import {EcsApplication, EcsDeploymentConfig, EcsDeploymentGroup} from "aws-cdk-lib/aws-codedeploy";
import {ApplicationLoadBalancedFargateService} from "aws-cdk-lib/aws-ecs-patterns";

export class SimpleShopUiComputeStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const defaultVpc = Vpc.fromLookup(this, 'DefaultVpc', {
            isDefault: true
        });

        const albSecurityGroup = new SecurityGroup(this, 'SimpleShopUiAlbSg', {
            vpc: defaultVpc,
            securityGroupName: 'SimpleShopUiAlbSg',
            allowAllOutbound: true
        });

        albSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.allTcp());

        const executionRole = new Role(this, 'SimpleShopUiExecutionRole', {
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


        /** Important to understand!!
         *
         * This task definition and container image is only created on the first run of 'cdk deploy'. Subsequent images are only created and pushed to ecr during the pipeline run, task
         * definition revisions are created when the ECS deployment action is run.
         */
        const taskDef = new TaskDefinition(
            this, 'SimpleShopUiTaskDefinition', {
                family: 'simple-shop-ui-family',
                compatibility: Compatibility.FARGATE,
                cpu: '256',
                memoryMiB: '512',
                executionRole: executionRole,
            },
        );

        taskDef.addContainer('SimpleShopUiContainer', {
            containerName: 'simple-shop-ui-container',
            image: ContainerImage.fromAsset('..'),
            cpu: 256,
            memoryLimitMiB: 512,
            essential: true,
            logging: LogDriver.awsLogs({
                streamPrefix: 'simple-shop-ui-container-logs',
            }),
            healthCheck: {
                "command": [
                    "CMD-SHELL",
                    "curl -f http://127.0.0.1:3000/ || exit 1"
                ],
                interval: Duration.seconds(30),
                timeout: Duration.seconds(5),
                retries: 3,
                startPeriod: Duration.seconds(30),
            },
            portMappings: [{containerPort: 3000, protocol: Protocol.TCP}]
        });

        const service = new ApplicationLoadBalancedFargateService(this, 'SimpleShopUiService', {
            cluster,
            serviceName: 'SimpleShopUiService',
            taskDefinition: taskDef,
            securityGroups: [albSecurityGroup],
            publicLoadBalancer: true,
            listenerPort: 30,
            protocol: ApplicationProtocol.HTTP,
            loadBalancerName: 'SimpleShopUiAlb',
            assignPublicIp: true,
            deploymentController: {
                type: DeploymentControllerType.CODE_DEPLOY,
            },
        });

        new ComputeDeploymentResources(this, 'SimpleShopUiDeploymentResources', {
            defaultVpc,
            service
        });
    }
}

class ComputeDeploymentResources extends Construct {
    constructor(scope: Construct, id: string, props: {
        defaultVpc: IVpc,
        service: ApplicationLoadBalancedFargateService,
    }) {
        super(scope, id);

        const defaultVpc = props.defaultVpc;

        const greenTg = new ApplicationTargetGroup(this, 'SimpleShopUiAlbGreeneTargetGroup', {
            vpc: defaultVpc,
            targetGroupName: 'SimpleShopUiAlbGreeneTargetGroup',
            targetType: TargetType.IP,
            protocol: ApplicationProtocol.HTTP
        });

        const greenListener = props.service.loadBalancer.addListener('SimpleShopUiAlbGreenListener', {
            protocol: ApplicationProtocol.HTTP,
            port: 3030,
            defaultTargetGroups: [greenTg],
        });

        greenListener.addAction('SimpleShopUiAlbGreenListenerAction', {
            action: ListenerAction.forward([greenTg]),
        });

        const application = new EcsApplication(this, 'SimpleShopUiEcsApplication', {
            applicationName: 'SimpleShopUiEcsApplication',
        });

        new EcsDeploymentGroup(this, 'SimpleShopUiEcsDeploymentGroup', {
            service: props.service.service,
            application,
            deploymentGroupName: 'SimpleShopUiEcsDeploymentGroup',
            deploymentConfig: EcsDeploymentConfig.ALL_AT_ONCE,
            blueGreenDeploymentConfig: {
                blueTargetGroup: props.service.targetGroup,
                greenTargetGroup: greenTg,
                listener: props.service.listener,
                testListener: greenListener,
                terminationWaitTime: Duration.minutes(1),
            },
        });
    }
}