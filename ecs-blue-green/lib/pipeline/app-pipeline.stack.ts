import {Construct} from 'constructs';
import {RemovalPolicy, Stack, StackProps} from "aws-cdk-lib";
import {AccountPrincipal, AnyPrincipal, Effect, PolicyDocument, PolicyStatement, Role} from "aws-cdk-lib/aws-iam";
import {Repository} from "aws-cdk-lib/aws-ecr";
import {
    CloudFormationCreateUpdateStackAction,
    CodeBuildAction, CodeDeployEcsDeployAction,
    CodeStarConnectionsSourceAction, ManualApprovalAction
} from "aws-cdk-lib/aws-codepipeline-actions";
import {Artifact, Pipeline, PipelineType} from "aws-cdk-lib/aws-codepipeline";
import {BuildEnvironmentVariableType, BuildSpec, Project} from "aws-cdk-lib/aws-codebuild";
import {EcsApplication, EcsDeploymentGroup} from "aws-cdk-lib/aws-codedeploy";

export class AppPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const github = this.node.tryGetContext('github');

        const ecrRepository = new Repository(this, 'AppEcrRepository', {
            repositoryName: 'app-ecr-repository',
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const sourceArtifact = new Artifact('SourceArtifact');

        const outputArtifact = new Artifact('OutputArtifact');

        const codeDeployArtifact = new Artifact('CodeDeployArtifact');

        const sourceAction = new CodeStarConnectionsSourceAction(
            {
                actionName: "Source",
                connectionArn: github.connectionArn,
                output: sourceArtifact,
                owner: github.owner,
                repo: github.repo,
                branch: 'main'
            }
        );

        const pipeline = new Pipeline(this, 'AppPipeline', {
            pipelineName: 'AppPipeline',
            pipelineType: PipelineType.V2,
            role: new Role(this, 'AppPipelineRole', {
                roleName: 'AppPipelineRole',
                assumedBy: new AnyPrincipal(),
                inlinePolicies: {
                    'sts': new PolicyDocument({
                        statements: [
                            new PolicyStatement({
                                effect: Effect.ALLOW,
                                resources: ['*'],
                                actions: ['sts:AssumeRole']
                            })
                        ]
                    }),
                }
            }),
        });

        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction]
        });

        const build = pipeline.addStage({
            stageName: 'Build',
        });

        build.addAction(new CodeBuildAction({
            actionName: "Build",
            input: sourceArtifact,
            outputs: [
                outputArtifact,
                codeDeployArtifact,
            ],
            project: new Project(this, 'AppPipelineBuildProject', {
                projectName: 'AppPipelineBuildProject',
                role: new Role(this, 'AppPipelineBuildProjectRole', {
                    roleName: 'AppPipelineBuildProjectRole',
                    assumedBy: new AnyPrincipal(),
                    inlinePolicies: {
                        'sts': new PolicyDocument({
                            statements: [
                                new PolicyStatement({
                                    effect: Effect.ALLOW,
                                    resources: ['*'],
                                    actions: ['*']
                                })
                            ]
                        }),
                    }
                }),
                buildSpec: BuildSpec.fromObject({
                    version: '0.2',
                    phases: {
                        install: {
                            commands: ['cd ecs-blue-green', 'npm install', 'npm run cdk synth']
                        },
                        build: {
                            commands: [
                                `aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin ${ecrRepository.repositoryUri}`,
                                `docker build -t $GIT_COMMIT_ID .`,
                                `docker tag $GIT_COMMIT_ID ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`,
                                `docker push ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`,
                                `./code_deploy/setup.sh ${ecrRepository.repositoryUri}:$GIT_COMMIT_ID`,
                                'ls'
                            ]
                        }
                    },
                    artifacts: {
                        'secondary-artifacts': {
                            'OutputArtifact': {
                                name: 'OutputArtifact',
                                files: ['ecs-blue-green/**/*'],
                                'discard-paths': 'no'
                            },
                            'CodeDeployArtifact': {
                                name: 'CodeDeployArtifact',
                                files: ['ecs-blue-green/code_deploy/*'],
                                'discard-paths': 'yes'
                            }
                        }
                    }
                })
            }),
            role: new Role(this, 'AppPipelineBuildActionRole', {
                roleName: 'AppPipelineBuildActionRole',
                assumedBy: new AnyPrincipal(),
                inlinePolicies: {
                    'sts': new PolicyDocument({
                        statements: [
                            new PolicyStatement({
                                effect: Effect.ALLOW,
                                resources: ['*'],
                                actions: ['*']
                            })
                        ]
                    }),
                }
            }),
            environmentVariables: {
                AWS_ACCOUNT: {
                    type: BuildEnvironmentVariableType.PLAINTEXT,
                    value: this.account
                },
                AWS_REGION: {
                    type: BuildEnvironmentVariableType.PLAINTEXT,
                    value: this.region
                },
                GIT_COMMIT_ID: {
                    type: BuildEnvironmentVariableType.PLAINTEXT,
                    value: sourceAction.variables.commitId
                }
            }
        }));

        const devStage = pipeline.addStage({
            stageName: 'Dev',
        });

        devStage.addAction(new CloudFormationCreateUpdateStackAction({
            actionName: 'DeployAppComputeStack',
            stackName: 'AppComputeStack',
            region: this.region,
            account: this.account,
            adminPermissions: true,
            parameterOverrides: {
                'tag': sourceAction.variables.commitId
            },
            templatePath: outputArtifact.atPath('ecs-blue-green/cdk.out/AppComputeStack.template.json')
        }));

        devStage.addAction(new ManualApprovalAction({
            actionName: 'ManualApproval',
            runOrder: 3
        }));

        devStage.addAction(new CodeDeployEcsDeployAction({
                actionName: 'Deploy',
                role: new Role(this, 'AppCodeDeployRole', {
                    roleName: 'AppCodeDeployRole',
                    assumedBy: new AccountPrincipal(Stack.of(this).account),
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
                    },
                }),
                appSpecTemplateInput: codeDeployArtifact,
                taskDefinitionTemplateInput: codeDeployArtifact,
                deploymentGroup: EcsDeploymentGroup.fromEcsDeploymentGroupAttributes(
                    this,
                    'AppEcsDeploymentGroup',
                    {
                        deploymentGroupName: 'AppEcsDeploymentGroup',
                        application: EcsApplication.fromEcsApplicationName(
                            this,
                            'AppEcsApplication',
                            'AppEcsApplication'
                        ),
                    }
                ),
                runOrder: 4,
            })
        );
    }
}

