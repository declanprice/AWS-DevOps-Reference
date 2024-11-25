import {Construct} from 'constructs';
import {CfnParameter, Duration, Stack, StackProps} from "aws-cdk-lib";
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
import {Repository} from "aws-cdk-lib/aws-ecr";

export class AppComputeStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const tagParam = new CfnParameter(this, 'tag', {
            type: 'String',
            description: 'tag'
        });

        const defaultVpc = Vpc.fromLookup(this, 'DefaultVpc', {
            isDefault: true
        });

        const albSecurityGroup = new SecurityGroup(this, 'AppAlbSg', {
            vpc: defaultVpc,
            securityGroupName: 'AppAlbSg',
            allowAllOutbound: true
        });

        albSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.allTcp());

        const executionRole = new Role(this, 'AppExecutionRole', {
            roleName: 'AppExecutionRole',
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

        const cluster = new Cluster(this, 'AppFargateCluster', {
            vpc: defaultVpc,
            clusterName: 'AppFargateCluster',
        });

        /** Important to understand!!
         *
         * This task definition and container image is only created on the first run of 'cdk deploy'. Subsequent images are only created and pushed to ecr during the pipeline run, task
         * definition revisions are created when the ECS deployment action is run.
         */
        const taskDef = new TaskDefinition(
            this, 'AppTaskDefinition', {
                family: 'app-container-family',
                compatibility: Compatibility.FARGATE,
                cpu: '256',
                memoryMiB: '512',
                executionRole: executionRole,
            },
        );

        taskDef.addContainer('AppContainer', {
            containerName: 'app-container',
            image: ContainerImage.fromEcrRepository(Repository.fromRepositoryName(this, 'AppContainerRepository', 'app-ecr-repository'), tagParam.valueAsString),
            cpu: 256,
            memoryLimitMiB: 512,
            essential: true,
            logging: LogDriver.awsLogs({
                streamPrefix: 'app-container-logs',
            }),
            healthCheck: {
                "command": [
                    "CMD-SHELL",
                    "curl -f http://127.0.0.1:8080/ || exit 1"
                ],
                interval: Duration.seconds(30),
                timeout: Duration.seconds(5),
                retries: 3,
                startPeriod: Duration.seconds(30),
            },
            portMappings: [{containerPort: 8080, protocol: Protocol.TCP}]
        });

        const service = new ApplicationLoadBalancedFargateService(this, 'AppService', {
            cluster,
            serviceName: 'AppService',
            taskDefinition: taskDef,
            securityGroups: [albSecurityGroup],
            publicLoadBalancer: true,
            listenerPort: 80,
            protocol: ApplicationProtocol.HTTP,
            loadBalancerName: 'AppAlb',
            assignPublicIp: true,
            deploymentController: {
                type: DeploymentControllerType.CODE_DEPLOY,
            },
        });

        new ComputeDeploymentResources(this, 'AppDeploymentResources', {
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

        const greenTg = new ApplicationTargetGroup(this, 'AppAlbGreeneTargetGroup', {
            vpc: defaultVpc,
            targetGroupName: 'AppAlbGreeneTargetGroup',
            targetType: TargetType.IP,
            protocol: ApplicationProtocol.HTTP
        });

        const greenListener = props.service.loadBalancer.addListener('AppAlbGreenListener', {
            protocol: ApplicationProtocol.HTTP,
            port: 8080,
            defaultTargetGroups: [greenTg],
        });

        greenListener.addAction('AppAlbGreenListenerAction', {
            action: ListenerAction.forward([greenTg]),
        });

        const application = new EcsApplication(this, 'AppEcsApplication', {
            applicationName: 'AppEcsApplication',
        });

        new EcsDeploymentGroup(this, 'AppEcsDeploymentGroup', {
            service: props.service.service,
            application,
            deploymentGroupName: 'AppEcsDeploymentGroup',
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